const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

test('real server starts with all routers and protects setlist routes', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DB_PATH: ':memory:', HOST: '127.0.0.1', PORT: '0', JWT_SECRET: randomBytes(32).toString('hex') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out: ' + output)), 10000);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
      child.stderr.on('data', (data) => { output += data; });
      child.stdout.on('data', (data) => {
        output += data;
        const match = output.match(/WorshipSessions running on 127\.0\.0\.1:(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    for (const route of ['sections/1', 'sections/reorder']) {
      const response = await fetch(`http://127.0.0.1:${port}/api/setlists/1/${route}`, { method: 'PUT' });
      assert.equal(response.status, 401);
    }
  } finally {
    child.kill();
  }
});
