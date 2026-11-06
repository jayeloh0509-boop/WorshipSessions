'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { backupDatabase, verifyBackup } = require('../lib/databaseBackup');

const root = path.resolve(__dirname, '..');
const writers = new WeakMap();

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ws-backup-test-'));
  writers.set(t, []);
  t.after(() => {
    for (const db of writers.get(t)) if (db.open) db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, source: path.join(dir, 'source.sqlite'), destination: path.join(dir, 'backup.sqlite') };
}

function openWriter(t, filename) {
  const db = new Database(filename);
  writers.get(t).push(db);
  db.pragma('journal_mode = WAL');
  db.pragma('wal_autocheckpoint = 0');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE parent(id INTEGER PRIMARY KEY, value TEXT); CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));');
  db.exec("INSERT INTO parent VALUES (41, 'wal-only'); INSERT INTO child VALUES (99, 41)");
  return db;
}

function digest(filename) {
  return createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function checkReopened(filename) {
  const copy = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    assert.deepEqual(copy.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    assert.deepEqual(copy.pragma('foreign_key_check'), []);
    return copy.prepare('SELECT child.id, parent_id, value FROM child JOIN parent ON parent.id = child.parent_id').get();
  } finally {
    copy.close();
  }
}

function cli(script, args, cwd, env = {}) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, ...env },
  });
}

test('staging permission failure cleans only its new empty directory', async (t) => {
  const { dir, source, destination } = fixture(t);
  openWriter(t, source);
  const before = fs.readdirSync(dir).sort();
  const original = fs.chmodSync;
  const mocked = t.mock.method(fs, 'chmodSync', (name, mode) => {
    if (path.basename(name).startsWith('.sqlite-backup-')) {
      const error = new Error('Synthetic permission refusal');
      error.code = 'EACCES';
      throw error;
    }
    return original(name, mode);
  });
  try {
    await assert.rejects(backupDatabase({ source, destination }), { code: 'EACCES' });
  } finally { mocked.mock.restore(); }
  assert.equal(fs.existsSync(destination), false);
  assert.deepEqual(fs.readdirSync(dir).sort(), before);
});

test('WAL-only committed rows survive independent reopen; source bytes are unchanged', async (t) => {
  const { source, destination } = fixture(t);
  const writer = openWriter(t, source);
  assert.ok(fs.statSync(source + '-wal').size > 0);
  // The main file does not yet contain even the committed schema.
  assert.equal(fs.statSync(source).size, writer.pragma('page_size', { simple: true }));
  const before = [digest(source), digest(source + '-wal')];
  const summary = await backupDatabase({ source, destination });
  assert.equal(summary.integrity, 'ok');
  assert.equal(summary.foreignKeyViolations, 0);
  assert.deepEqual(summary.tableCounts, { child: 1, parent: 1 });
  assert.deepEqual(checkReopened(destination), { id: 99, parent_id: 41, value: 'wal-only' });
  assert.deepEqual([digest(source), digest(source + '-wal')], before);
  assert.equal(writer.prepare('SELECT COUNT(*) AS n FROM parent').get().n, 1);
  for (const suffix of ['-wal', '-shm', '-journal']) assert.equal(fs.existsSync(destination + suffix), false);
});

test('online backup stays consistent while the open WAL writer commits', async (t) => {
  const { source, destination } = fixture(t);
  const writer = openWriter(t, source);
  writer.exec('CREATE TABLE payload(id INTEGER PRIMARY KEY, value BLOB)');
  const insert = writer.prepare('INSERT INTO payload(value) VALUES (zeroblob(12000))');
  writer.transaction(() => { for (let i = 0; i < 400; i++) insert.run(); })();
  let commits = 0;
  const timer = setInterval(() => {
    if (commits < 4) {
      writer.transaction(() => {
        const id = 100 + commits;
        writer.prepare('INSERT INTO parent VALUES (?, ?)').run(id, 'concurrent');
        writer.prepare('INSERT INTO child VALUES (?, ?)').run(id, id);
      })();
      commits++;
    }
  }, 1);
  try {
    await backupDatabase({ source, destination });
  } finally {
    clearInterval(timer);
  }
  assert.ok(commits > 0, 'a writer committed during the online backup');
  const restored = new Database(destination, { readonly: true });
  try {
    assert.deepEqual(restored.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    assert.deepEqual(restored.pragma('foreign_key_check'), []);
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM payload').get().n, 400);
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM parent').get().n, restored.prepare('SELECT COUNT(*) AS n FROM child').get().n);
  } finally { restored.close(); }
});

test('refuses existing files, directories, hardlinks, and SQLite sidecars without overwriting', async (t) => {
  const { dir, source, destination } = fixture(t);
  openWriter(t, source);
  fs.writeFileSync(destination, 'sentinel');
  await assert.rejects(backupDatabase({ source, destination }), { code: 'DESTINATION_EXISTS' });
  assert.equal(fs.readFileSync(destination, 'utf8'), 'sentinel');
  const directory = path.join(dir, 'existing-directory');
  fs.mkdirSync(directory);
  await assert.rejects(backupDatabase({ source, destination: directory }), { code: 'DESTINATION_EXISTS' });
  const hardlink = path.join(dir, 'hardlink.sqlite');
  fs.linkSync(source, hardlink);
  await assert.rejects(backupDatabase({ source, destination: hardlink }), { code: 'DESTINATION_EXISTS' });
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const target = path.join(dir, 'sidecar-' + suffix + '.sqlite');
    fs.writeFileSync(target + suffix, 'sidecar sentinel');
    await assert.rejects(backupDatabase({ source, destination: target }), { code: 'DESTINATION_EXISTS' });
    assert.equal(fs.existsSync(target), false);
    assert.equal(fs.readFileSync(target + suffix, 'utf8'), 'sidecar sentinel');
  }
  for (const target of [source, source + '-wal', source + '-shm', source + '-journal', dir]) {
    await assert.rejects(backupDatabase({ source, destination: target }));
  }
});

test('rejects dangling symlinks, source symlinks and junction parent aliases', async (t) => {
  const { dir, source } = fixture(t);
  openWriter(t, source);
  const link = path.join(dir, 'dangling.sqlite');
  try {
    fs.symlinkSync(path.join(dir, 'absent.sqlite'), link, 'file');
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    t.diagnostic('File symlinks require Windows privilege; directory junction coverage still runs.');
  }
  if (fs.existsSync(link) || (() => { try { return fs.lstatSync(link).isSymbolicLink(); } catch { return false; } })()) {
    await assert.rejects(backupDatabase({ source, destination: link }), { code: 'PATH_ALIAS' });
    fs.unlinkSync(link);
    fs.symlinkSync(source, link, 'file');
    await assert.rejects(backupDatabase({ source: link, destination: path.join(dir, 'new.sqlite') }), { code: 'PATH_ALIAS' });
  }
  const real = path.join(dir, 'real');
  fs.mkdirSync(real);
  const alias = path.join(dir, 'alias');
  fs.symlinkSync(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(backupDatabase({ source, destination: path.join(alias, 'backup.sqlite') }), { code: 'PATH_ALIAS' });
  assert.deepEqual(fs.readdirSync(real), []);
});

test('missing/malformed sources and foreign key violations leave no target or staging artifacts', async (t) => {
  const { dir, source, destination } = fixture(t);
  await assert.rejects(backupDatabase({ source, destination }), { code: 'SOURCE_NOT_FILE' });
  assert.equal(fs.existsSync(source), false);
  fs.writeFileSync(source, 'not a sqlite database');
  const before = digest(source);
  await assert.rejects(backupDatabase({ source, destination }));
  assert.equal(digest(source), before);
  assert.equal(fs.existsSync(destination), false);
  const invalid = path.join(dir, 'invalid.sqlite');
  const db = new Database(invalid);
  writers.get(t).push(db);
  db.pragma('foreign_keys = OFF');
  db.exec('CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(p_id INTEGER REFERENCES p(id)); INSERT INTO c VALUES (999)');
  db.close();
  await assert.rejects(backupDatabase({ source: invalid, destination }), { code: 'FOREIGN_KEYS_FAILED' });
  assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.readdirSync(dir).some((name) => name.startsWith('.sqlite-backup-')), false);
});

test('exclusive concurrent publication has one winner and never clobbers its result', async (t) => {
  const { source, destination, dir } = fixture(t);
  openWriter(t, source);
  const results = await Promise.allSettled([
    backupDatabase({ source, destination }), backupDatabase({ source, destination }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  checkReopened(destination);
  assert.equal(fs.readdirSync(dir).some((name) => name.startsWith('.sqlite-backup-')), false);
});

function currentSchema(source) {
  // Never require db.js in this test process: a child receives ONLY a synthetic,
  // explicit absolute DB_PATH before any app module is loaded.
  const child = spawnSync(process.execPath, ['-e', `
    const { db, setSetting } = require('./lib/db');
    db.prepare('INSERT INTO users (id, username, password_hash, gemini_api_key) VALUES (?, ?, ?, ?)').run(17, 'synthetic', 'synthetic-hash', 'SYNTHETIC_SECRET');
    db.prepare('INSERT INTO songs (id, user_id, title, content, visibility) VALUES (?, ?, ?, ?, ?)').run(23, 17, 'Synthetic private song', 'SYNTHETIC_CHART_BODY', 'private');
    db.prepare('INSERT INTO songs (id, user_id, title, content, visibility, parent_id) VALUES (?, ?, ?, ?, ?, ?)').run(24, 17, 'Synthetic derivative', 'SYNTHETIC_CHART_BODY', 'private', 23);
    db.prepare('INSERT INTO setlists (id, user_id, name, visibility, rehearsal_notes) VALUES (?, ?, ?, ?, ?)').run(31, 17, 'Synthetic setlist', 'private', 'synthetic rehearsal');
    db.prepare('INSERT INTO setlist_sections (id, setlist_id, name, position) VALUES (37, 31, ?, 0)').run('Opening');
    db.prepare('INSERT INTO setlist_songs (id, setlist_id, song_id, position, section_id, performance_key, song_notes, transition_notes, arrangement_confirmed, key_confirmed, transition_rehearsed, chart_verified, content_override) VALUES (43, 31, 23, 0, 37, ?, ?, ?, 1, 1, 1, 1, ?)').run('D', 'synthetic note', 'synthetic transition', 'SYNTHETIC_CHART_BODY');
    db.prepare('INSERT INTO invites (code, created_by, used_by) VALUES (?, 17, 17)').run('synthetic-invite');
    db.prepare('INSERT INTO changelog_entries (version, title, summary, body, created_by, updated_by) VALUES (?, ?, ?, ?, 17, 17)').run('test', 'test', 'test', 'test');
    setSetting('synthetic_setting', 'SYNTHETIC_SECRET');
    db.close();
  `], { cwd: root, env: { ...process.env, DB_PATH: source }, encoding: 'utf8' });
  assert.equal(child.status, 0, 'isolated current-schema fixture initialization must succeed');
}

test('current app schema survives isolated restore with exact IDs, rows, private flags and prep fields', async (t) => {
  const { source, destination, dir } = fixture(t);
  currentSchema(source);
  const summary = await backupDatabase({ source, destination });
  for (const name of ['users', 'songs', 'setlists', 'setlist_songs', 'setlist_sections', 'settings', 'invites', 'changelog_entries', 'songs_search']) {
    assert.ok(Object.hasOwn(summary.tableCounts, name), name);
  }
  const scratchDir = path.join(dir, 'recovery');
  fs.mkdirSync(scratchDir);
  const scratch = path.join(scratchDir, 'restored.sqlite');
  // Backup sits in dir, so place scratch outside that backup directory tree.
  const isolatedDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ws-recovery-test-'));
  t.after(() => fs.rmSync(isolatedDir, { recursive: true, force: true }));
  const isolated = path.join(isolatedDir, 'restored.sqlite');
  await assert.rejects(verifyBackup({ backup: destination, scratch }), { code: 'SCRATCH_NOT_ISOLATED' });
  const before = digest(destination);
  const result = await verifyBackup({ backup: destination, scratch: isolated });
  assert.equal(result.operation, 'verify-recovery');
  assert.equal(digest(destination), before);
  const original = new Database(source, { readonly: true });
  const restored = new Database(isolated, { readonly: true });
  try {
    const tables = original.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
    for (const { name } of tables) {
      const quoted = '"' + name.replace(/"/g, '""') + '"';
      assert.deepEqual(restored.prepare('SELECT * FROM ' + quoted).all(), original.prepare('SELECT * FROM ' + quoted).all(), name);
    }
    assert.deepEqual(restored.pragma('foreign_key_check'), []);
    assert.equal(restored.prepare('SELECT visibility FROM songs WHERE id=23').get().visibility, 'private');
    assert.equal(restored.prepare('SELECT section_id FROM setlist_songs WHERE id=43').get().section_id, 37);
    assert.equal(restored.prepare('SELECT chart_verified FROM setlist_songs WHERE id=43').get().chart_verified, 1);
  } finally { original.close(); restored.close(); }
  await assert.rejects(verifyBackup({ backup: destination, scratch: isolated }), { code: 'DESTINATION_EXISTS' });
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'), false);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_CHART_BODY'), false);
});

test('CLI explicit arguments, statuses and redacted JSON; DB_PATH is never consulted', (t) => {
  const { source, destination, dir } = fixture(t);
  openWriter(t, source);
  const env = { DB_PATH: path.join(dir, 'must-not-create.sqlite') };
  for (const args of [[], ['--source', source], ['--force'], ['--source', source, '--source', source, '--destination', destination]]) {
    const result = cli('backup-db.js', args, dir, env);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stderr).ok, false);
    assert.equal(fs.existsSync(env.DB_PATH), false);
  }
  const help = cli('backup-db.js', ['--help'], dir, env);
  assert.equal(help.status, 0);
  const success = cli('backup-db.js', ['--source', source, '--destination', destination], dir, env);
  assert.equal(success.status, 0);
  assert.equal(JSON.parse(success.stdout).operation, 'backup');
  const refusal = cli('backup-db.js', ['--source', source, '--destination', destination], dir, env);
  assert.equal(refusal.status, 1);
  assert.equal(JSON.parse(refusal.stderr).code, 'DESTINATION_EXISTS');
  const missing = cli('backup-db.js', ['--source', env.DB_PATH, '--destination', path.join(dir, 'other.sqlite')], dir, env);
  assert.equal(missing.status, 1);
  assert.equal(fs.existsSync(env.DB_PATH), false);
  const isolatedDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ws-cli-recovery-'));
  t.after(() => fs.rmSync(isolatedDir, { recursive: true, force: true }));
  const recovered = cli('verify-db-backup.js', ['--backup', destination, '--scratch', path.join(isolatedDir, 'drill.sqlite')], dir, env);
  assert.equal(recovered.status, 0);
  assert.equal(JSON.parse(recovered.stdout).operation, 'verify-recovery');
  const force = cli('verify-db-backup.js', ['--backup', destination, '--scratch', path.join(isolatedDir, 'other.sqlite'), '--force'], dir, env);
  assert.equal(force.status, 2);
});
