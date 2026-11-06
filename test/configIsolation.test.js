const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { startServer } = require('./helpers/startServer');

test(
  'an explicit dotenv disable path isolates tests; normal synthetic dotenv loading still works',
  { timeout: 20000 },
  async (t) => {
    const cwd = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ws-config-isolation-'));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    fs.writeFileSync(path.join(cwd, '.env'), 'TURNSTILE_SITE_KEY=synthetic-site-key\n');
    const isolated = await startServer({ cwd });
    try {
      const response = await fetch(isolated.base + '/api/auth/config');
      assert.equal((await response.json()).turnstileSiteKey, null);
    } finally {
      await isolated.close();
    }
    const configured = await startServer({ cwd, env: { DOTENV_CONFIG_PATH: path.join(cwd, '.env') } });
    try {
      const response = await fetch(configured.base + '/api/auth/config');
      assert.equal((await response.json()).turnstileSiteKey, 'synthetic-site-key');
    } finally {
      await configured.close();
    }
  },
);
