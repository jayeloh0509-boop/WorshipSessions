const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const DIGEST = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40,64}$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/;
const STATES = ['clean', 'modified', 'unknown'];

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fingerprint(root, targets) {
  const entries = [];
  function walk(relative) {
    const full = path.join(root, relative);
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch {
      return;
    }
    // Source discovery never follows links or reads deployment data/.env files.
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) walk(path.join(relative, name));
    } else if (/\.(?:js|mjs|cjs|ts|tsx|css|json|html|py)$/.test(relative)) {
      entries.push([relative.replaceAll('\\', '/'), digest(fs.readFileSync(full))]);
    }
  }
  for (const target of targets) walk(target);
  return digest(JSON.stringify(entries));
}

function fingerprintBackend(root) {
  return fingerprint(root, [
    'server.js',
    'lib',
    'routes',
    'package.json',
    'package-lock.json',
    'scripts/extract_pdf_text.py',
    'scripts/render_pdf_pages.py',
    'scripts/backup-db.js',
    'scripts/verify-db-backup.js',
    'scripts/seed-data.mjs',
  ]);
}

function createBuildIdentity(root, options = {}) {
  let revision = options.revision ?? process.env.WS_SOURCE_REVISION;
  let sourceState = options.sourceState ?? process.env.WS_SOURCE_DIRTY;
  if (sourceState === 'true') sourceState = 'modified';
  if (sourceState === 'false') sourceState = 'clean';
  if (revision === undefined) {
    try {
      revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      }).trim();
      if (sourceState === undefined) {
        const status = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=normal'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 3000,
        });
        sourceState = status.trim() ? 'modified' : 'clean';
      }
    } catch {
      /* A source archive may legitimately have no Git directory. */
    }
  }
  let packageVersion = null;
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    if (typeof value === 'string' && VERSION.test(value)) packageVersion = value;
  } catch {
    /* Unknown is preferable to an invented version. */
  }
  const identity = {
    schemaVersion: 1,
    revision: typeof revision === 'string' && REVISION.test(revision) ? revision : null,
    sourceState: STATES.includes(sourceState) ? sourceState : 'unknown',
    packageVersion,
    builtAt: options.builtAt || new Date().toISOString(),
    backendFingerprint: fingerprintBackend(root),
    frontendFingerprint: fingerprint(root, [
      'frontend/src',
      'frontend/index.html',
      'frontend/vite.config.ts',
      'frontend/package.json',
      'frontend/package-lock.json',
    ]),
  };
  return { ...identity, buildId: `ws-${digest(JSON.stringify(identity)).slice(0, 24)}` };
}

function unknownIdentity() {
  return {
    schemaVersion: 1,
    buildId: null,
    revision: null,
    sourceState: 'unknown',
    packageVersion: null,
    builtAt: null,
    backendMatchesBuild: null,
  };
}

function readBuildIdentity(publicDir, root) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(publicDir, 'build-info.json'), 'utf8'));
    if (
      data.schemaVersion !== 1 ||
      typeof data.buildId !== 'string' ||
      !/^ws-[a-f0-9]{24}$/.test(data.buildId) ||
      !(data.revision === null || (typeof data.revision === 'string' && REVISION.test(data.revision))) ||
      !STATES.includes(data.sourceState) ||
      !(
        data.packageVersion === null ||
        (typeof data.packageVersion === 'string' && VERSION.test(data.packageVersion))
      ) ||
      typeof data.builtAt !== 'string' ||
      !Number.isFinite(Date.parse(data.builtAt)) ||
      typeof data.backendFingerprint !== 'string' ||
      !DIGEST.test(data.backendFingerprint) ||
      typeof data.frontendFingerprint !== 'string' ||
      !DIGEST.test(data.frontendFingerprint)
    )
      return unknownIdentity();
    // Allowlist only; arbitrary manifest/environment fields are never reflected.
    return {
      schemaVersion: 1,
      buildId: data.buildId,
      revision: data.revision,
      sourceState: data.sourceState,
      packageVersion: data.packageVersion,
      builtAt: data.builtAt,
      backendMatchesBuild: fingerprintBackend(root) === data.backendFingerprint,
    };
  } catch {
    return unknownIdentity();
  }
}

module.exports = { createBuildIdentity, readBuildIdentity, fingerprintBackend };
