const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveDatabasePath } = require('../lib/databasePath');

test('uses the WorshipSessions database path for a new install', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worshipsessions-db-'));
  assert.equal(resolveDatabasePath('', root), path.join(root, 'data', 'worshipsessions.db'));
});

test('migrates the former database filename and SQLite sidecars', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worshipsessions-db-'));
  const data = path.join(root, 'data');
  fs.mkdirSync(data);
  const formerName = ['chord', 'vault.db'].join('');
  for (const suffix of ['', '-wal', '-shm']) fs.writeFileSync(path.join(data, formerName + suffix), suffix || 'db');

  const resolved = resolveDatabasePath('', root);

  assert.equal(resolved, path.join(data, 'worshipsessions.db'));
  for (const suffix of ['', '-wal', '-shm']) {
    assert.equal(fs.existsSync(path.join(data, formerName + suffix)), false);
    assert.equal(fs.existsSync(path.join(data, 'worshipsessions.db' + suffix)), true);
  }
});
