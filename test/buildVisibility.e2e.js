/* global localStorage, document, innerWidth */
// Explicit isolated UI verification; never builds into or serves the live public directory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
const { startServer } = require('./helpers/startServer');
const root = path.resolve(__dirname, '..');

async function main() {
  const publicDir = process.env.WS_QA_PUBLIC_DIR;
  const scratch = process.env.TMPDIR;
  if (
    !publicDir ||
    !path.isAbsolute(publicDir) ||
    !fs.existsSync(path.join(publicDir, 'build-info.json')) ||
    !scratch
  ) {
    throw new Error('Set WS_QA_PUBLIC_DIR to an absolute built artifact directory and TMPDIR to isolated scratch.');
  }
  const fixture = fs.mkdtempSync(path.join(scratch, 'ws-build-ui-'));
  const database = path.join(fixture, 'fixture.sqlite');
  let server;
  let browser;
  try {
    const seed = spawnSync(
      process.execPath,
      [
        '-e',
        "const {db}=require('./lib/db');db.prepare('INSERT INTO users(id,username,password_hash,role) VALUES(1,?,?,?)').run('fixture-owner','not-a-login','owner');db.close();",
      ],
      {
        cwd: root,
        env: { ...process.env, DB_PATH: database, NODE_ENV: 'test' },
        encoding: 'utf8',
      },
    );
    assert.equal(seed.status, 0, 'Synthetic account initialization');
    const env = { WORSHIPSESSIONS_PUBLIC_DIR: publicDir };
    if (process.env.WORSHIPSESSIONS_PYTHON) env.WORSHIPSESSIONS_PYTHON = process.env.WORSHIPSESSIONS_PYTHON;
    server = await startServer({ database, env });
    const identity = await (await fetch(server.base + '/api/build')).json();
    assert.equal(identity.backendMatchesBuild, true, 'Rebuild the artifact after changing backend source');
    const token = jwt.sign({ id: 1 }, server.secret, { expiresIn: '5m' });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addInitScript((user) => localStorage.setItem('cv_user', JSON.stringify(user)), {
      id: 1,
      username: 'fixture-owner',
      role: 'owner',
      token,
    });
    const page = await context.newPage();
    const openSettings = async () => {
      await page.goto(server.base);
      const menu = page.locator('[aria-label="Open navigation menu"]');
      await menu.waitFor({ state: 'attached' });
      if (await menu.isVisible()) await menu.click();
      else await page.getByRole('button', { name: 'Account', exact: true }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    };
    const widths = [320, 390, 430, 1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await openSettings();
      await page.getByText('Build matches this app.', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    const diagnostics = await page.evaluate(async () => {
      const user = JSON.parse(localStorage.getItem('cv_user'));
      const response = await fetch('/api/admin/runtime-status', { headers: { Authorization: 'Bearer ' + user.token } });
      return { status: response.status, data: await response.json() };
    });
    assert.equal(diagnostics.status, 200);
    assert.equal(diagnostics.data.database.quickCheck, 'ok');
    assert.equal(diagnostics.data.vision.inferenceTested, false);
    assert.ok(!JSON.stringify(diagnostics.data).includes(token));
    assert.ok(!JSON.stringify(diagnostics.data).includes(root));
    // Negative UI contract: simulate an older server's metadata; never alter any artifact or live server.
    await page.route('**/api/build', (route) =>
      route.fulfill({ json: { ...identity, buildId: 'ws-' + '0'.repeat(24) } }),
    );
    await openSettings();
    await page.getByRole('alert').filter({ hasText: 'different builds' }).waitFor();
    console.log(
      JSON.stringify({
        status: 'passed',
        isolated: true,
        matchingWidths: widths,
        mismatchWarning: true,
        ownerDiagnostics: true,
        modelInference: false,
      }),
    );
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      try {
        if (server) await server.close();
      } finally {
        fs.rmSync(fixture, { recursive: true, force: true });
      }
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
