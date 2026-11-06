const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBuildIdentity } = require('../lib/buildIdentity');
const { startServer } = require('./helpers/startServer');

test('a running process retains its loaded identity when its public manifest is replaced', { timeout: 20000 }, async (t) => {
  const root = path.resolve(__dirname, '..');
  const publicDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ws-startup-identity-'));
  t.after(() => fs.rmSync(publicDir, { recursive: true, force: true }));
  const options = { revision: 'c'.repeat(40), sourceState: 'modified' };
  const first = createBuildIdentity(root, { ...options, builtAt: '2026-11-01T00:00:00.000Z' });
  const second = createBuildIdentity(root, { ...options, builtAt: '2026-11-01T00:00:01.000Z' });
  const manifest = path.join(publicDir, 'build-info.json');
  fs.writeFileSync(manifest, JSON.stringify(first));
  const server = await startServer({ env: { WORSHIPSESSIONS_PUBLIC_DIR: publicDir } });
  try {
    const get = async (route) => {
      const response = await fetch(server.base + route);
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await get('/api/build')).buildId, first.buildId);
    fs.writeFileSync(manifest, JSON.stringify(second));
    assert.equal((await get('/build-info.json')).buildId, second.buildId);
    assert.equal((await get('/api/build')).buildId, first.buildId);
    assert.equal((await get('/api/health')).buildId, first.buildId);
  } finally { await server.close(); }
});
