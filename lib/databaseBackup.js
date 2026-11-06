'use strict';

// Deliberately independent of db.js, databasePath.js, dotenv and application startup.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const SUFFIXES = ['', '-wal', '-shm', '-journal'];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function explicitPath(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.includes('\0') || value === ':memory:') {
    fail('INVALID_PATH', 'An explicit filesystem path is required.');
  }
  return path.resolve(value);
}

function existing(value) {
  try {
    return fs.lstatSync(value);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Reject symlink/junction ancestors rather than silently resolving an alias.
function noSymlinks(value) {
  let current = value;
  while (true) {
    if (existing(current)?.isSymbolicLink()) fail('PATH_ALIAS', 'Symlinks and junctions are not permitted.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function pathKey(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function validatePaths(sourceValue, destinationValue) {
  const source = explicitPath(sourceValue);
  const destination = explicitPath(destinationValue);
  noSymlinks(source);
  const sourceStat = existing(source);
  if (!sourceStat?.isFile()) fail('SOURCE_NOT_FILE', 'Source must be an existing regular database file.');
  noSymlinks(destination);
  const parent = path.dirname(destination);
  if (!existing(parent)?.isDirectory()) fail('DESTINATION_PARENT', 'Destination parent must be an existing directory.');
  const sourceNames = new Set(SUFFIXES.map((suffix) => pathKey(source + suffix)));
  for (const suffix of SUFFIXES) {
    const candidate = destination + suffix;
    if (sourceNames.has(pathKey(candidate))) fail('SOURCE_ALIAS', 'Destination overlaps the source or its SQLite sidecars.');
    if (existing(candidate)) fail('DESTINATION_EXISTS', 'Destination and all SQLite sidecar paths must be absent.');
  }
  // Resolve real parents as an additional defense against case/short-name aliases.
  const actualSource = path.join(fs.realpathSync(path.dirname(source)), path.basename(source));
  const actualDestination = path.join(fs.realpathSync(parent), path.basename(destination));
  for (const a of SUFFIXES) {
    for (const b of SUFFIXES) {
      if (pathKey(actualSource + a) === pathKey(actualDestination + b)) {
        fail('SOURCE_ALIAS', 'Destination aliases the source or its SQLite sidecars.');
      }
    }
  }
  return { source, destination, sourceStat };
}

function inspectDatabase(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    const integrity = db.pragma('integrity_check');
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      fail('INTEGRITY_FAILED', 'SQLite integrity check failed.');
    }
    if (db.pragma('foreign_key_check').length !== 0) {
      fail('FOREIGN_KEYS_FAILED', 'SQLite foreign key check failed.');
    }
    // Counts only: never expose user fields, secrets, titles or chart content.
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all();
    const tableCounts = {};
    for (const { name } of tables) {
      const quoted = '"' + name.replace(/"/g, '""') + '"';
      Object.defineProperty(tableCounts, name, {
        value: db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get().count,
        enumerable: true,
      });
    }
    return { integrity: 'ok', foreignKeyViolations: 0, tableCounts };
  } finally {
    db.close();
  }
}

async function backupDatabase({ source: sourceValue, destination: destinationValue } = {}) {
  const { source, destination, sourceStat } = validatePaths(sourceValue, destinationValue);
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.sqlite-backup-'));
  const stagedFile = path.join(staging, 'snapshot.sqlite');
  let reader;
  let summary;
  try {
    fs.chmodSync(staging, 0o700);
    reader = new Database(source, { readonly: true, fileMustExist: true });
    reader.pragma('query_only = ON');
    // SQLite's online backup includes committed WAL frames, unlike a raw file copy.
    await reader.backup(stagedFile);
    reader.close();
    reader = null;
    // Normalize only our disposable snapshot to a standalone, sidecar-free file.
    const snapshot = new Database(stagedFile, { fileMustExist: true });
    try {
      snapshot.pragma('journal_mode = DELETE');
    } finally {
      snapshot.close();
    }
    fs.chmodSync(stagedFile, 0o600);
    const checks = inspectDatabase(stagedFile);
    const fd = fs.openSync(stagedFile, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // Check again after asynchronous backup work. link() atomically publishes a
    // complete file and fails if ANY entry (including a dangling link) now exists.
    validatePaths(source, destination);
    const now = fs.statSync(source);
    if (now.dev !== sourceStat.dev || now.ino !== sourceStat.ino) {
      fail('SOURCE_CHANGED', 'Source identity changed during backup.');
    }
    summary = {
      ok: true,
      operation: 'backup',
      source,
      destination,
      bytes: fs.statSync(stagedFile).size,
      ...checks,
    };
    fs.linkSync(stagedFile, destination);
  } finally {
    if (reader?.open) reader.close();
    try {
      fs.rmSync(staging, { recursive: true, force: true });
    } catch {
      // Never report a published, verified backup as failed due to staging cleanup.
      if (summary) summary.stagingCleanupWarning = true;
    }
  }
  return summary;
}

async function verifyBackup({ backup, scratch } = {}) {
  const { source, destination } = validatePaths(backup, scratch);
  const sourceParent = pathKey(fs.realpathSync(path.dirname(source)));
  const targetParent = pathKey(fs.realpathSync(path.dirname(destination)));
  const relative = path.relative(sourceParent, targetParent);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    fail('SCRATCH_NOT_ISOLATED', 'Recovery scratch must be outside the backup directory tree.');
  }
  const result = await backupDatabase({ source, destination });
  // inspectDatabase opened the complete recovered file independently; publication
  // is a hard link to those exact verified bytes, never a live database replacement.
  return { ...result, operation: 'verify-recovery', backup: result.source, scratch: result.destination };
}

function parseArguments(argv, required) {
  const values = {};
  if (argv.length === 1 && argv[0] === '--help') return null;
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2);
    if (!argv[i]?.startsWith('--') || !required.includes(key) || Object.hasOwn(values, key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      fail('USAGE', 'Supply each required explicit path once; unknown flags are rejected.');
    }
    values[key] = argv[i + 1];
  }
  if (required.some((key) => !values[key])) fail('USAGE', 'All explicit path arguments are required.');
  return values;
}

function reportFailure(error) {
  // SQLite/OS messages may contain schema text or paths; expose only a stable code.
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'BACKUP_FAILED';
  console.error(JSON.stringify({ ok: false, code, message: 'Operation refused or failed; no existing database was replaced.' }));
  process.exitCode = code === 'USAGE' || code === 'INVALID_PATH' ? 2 : 1;
}

module.exports = { backupDatabase, verifyBackup, parseArguments, reportFailure };
