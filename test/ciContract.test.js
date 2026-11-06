/* global AbortSignal */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('hook delegates to the fail-fast runner without masking failures', () => {
  const hook = read('.husky/pre-commit');
  assert.match(hook, /^exec node scripts\/check-release\.js\s*$/m);
  assert.doesNotMatch(hook, /npx|npm test|\|\| true/);
});

test('CI keeps read-only defaults, complete quality checks and no publishing', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /workflow_call:/);
  assert.match(ci, /permissions:\n {2}contents: read/);
  assert.doesNotMatch(ci, /packages: write|push: true|secrets: inherit/);
  for (const command of [
    'npm run lint',
    'npm test',
    'npx tsc -b',
    'npm run build',
    'node --test test/ciContract.test.js',
  ]) {
    assert.ok(ci.includes(command), command);
  }
  for (const prerequisite of [
    'actions/setup-python@',
    "python-version: '3.12'",
    'PyMuPDF==1.26.7',
    'poppler-utils',
    'WS_LIVE_VISION:',
    'DB_PATH:',
    'WS_SOURCE_REVISION=',
    'WS_SOURCE_DIRTY=false',
  ]) {
    assert.ok(ci.includes(prerequisite), prerequisite);
  }
  assert.match(ci, /needs: quality-gate/);
  assert.match(ci, /push: false/);
  assert.doesNotMatch(ci, /node test\/smoke\.js|sleep 2/);
  assert.match(ci, /node-version-file: .nvmrc/);
  assert.ok(ci.includes('node test/buildVisibility.e2e.js'));
  assert.match(
    ci,
    /name: Isolated authenticated HTTP smoke after build\n {8}run: node --test test\/ciContract\.test\.js\n {8}env:\n {10}WS_QA_PUBLIC_DIR: \$\{\{ github\.workspace \}\}\/public/,
  );
  assert.ok(ci.includes('playwright install chromium --with-deps'));
  assert.doesNotMatch(ci, /TMPDIR:.*runner\.temp/);
});

test('publishing is manual opt-in and depends on reusable quality workflow', () => {
  const docker = read('.github/workflows/docker.yml');
  assert.match(docker, /on:\n {2}workflow_dispatch:\n {4}inputs:\n {6}publish:/);
  assert.match(docker, /type: boolean\n {8}default: false/);
  assert.doesNotMatch(docker, /^ {2}(push|pull_request|workflow_run):/m);
  assert.match(docker, /quality-gate:\n {4}uses: .\/\.github\/workflows\/ci\.yml/);
  assert.match(docker, /needs: quality-gate/);
  assert.match(docker, /if:.*github\.event_name == 'workflow_dispatch'.*inputs\.publish == true/);
  assert.match(docker, /permissions:\n {2}contents: read/);
  assert.equal((docker.match(/packages: write/g) || []).length, 1);
  assert.match(docker, /WS_SOURCE_REVISION=\$\{\{ github\.sha \}\}/);
  assert.match(docker, /WS_SOURCE_DIRTY=false/);
});

const os = require('node:os');
const scratch = process.env.TMPDIR || os.tmpdir();
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { startServer, selectSmokePublicDir } = require('./helpers/startServer');

test('default smoke public directory is fresh and empty, independent of repo build', async () => {
  const fixture = selectSmokePublicDir();
  try {
    assert.equal(fixture.built, false);
    assert.notEqual(fixture.publicDir, path.join(root, 'public'));
    assert.deepEqual(fs.readdirSync(fixture.publicDir), []);
    const server = await startServer({ env: { WORSHIPSESSIONS_PUBLIC_DIR: fixture.publicDir } });
    try {
      assert.equal((await fetch(server.base + '/')).status, 404);
    } finally {
      await server.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test('explicit smoke artifact rejects relative, nonexistent and incomplete directories', () => {
  assert.throws(() => selectSmokePublicDir('public'), /absolute/);
  const fixture = fs.mkdtempSync(path.join(scratch, 'ws-invalid-public-'));
  try {
    assert.throws(() => selectSmokePublicDir(path.join(fixture, 'missing')), /index|artifact/);
    assert.throws(() => selectSmokePublicDir(fixture), /index|artifact/);
    fs.writeFileSync(path.join(fixture, 'index.html'), '<html>synthetic</html>');
    assert.throws(() => selectSmokePublicDir(fixture), /manifest|build-info/);
    fs.writeFileSync(path.join(fixture, 'build-info.json'), '{}');
    assert.throws(() => selectSmokePublicDir(fixture), /manifest|build-info/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('explicit synthetic artifact serves index only when valid manifest is present', async () => {
  const publicDir = fs.mkdtempSync(path.join(scratch, 'ws-built-contract-'));
  try {
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<html>synthetic artifact contract</html>');
    const { createBuildIdentity } = require('../lib/buildIdentity');
    fs.writeFileSync(path.join(publicDir, 'build-info.json'), JSON.stringify(createBuildIdentity(root)));
    const artifact = selectSmokePublicDir(publicDir);
    assert.equal(artifact.built, true);
    const server = await startServer({ env: { WORSHIPSESSIONS_PUBLIC_DIR: artifact.publicDir } });
    try {
      const response = await fetch(server.base + '/');
      assert.equal(response.status, 200);
      assert.match(await response.text(), /synthetic artifact contract/);
    } finally {
      await server.close();
    }
    artifact.cleanup();
    assert.ok(fs.existsSync(publicDir), 'caller-owned artifacts are never deleted');
  } finally {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

for (const serverFails of [false, true]) {
  test(`browser cleanup failure still attempts server and fixture cleanup (server fails: ${serverFails})`, async () => {
    const calls = [];
    const fakeServer = {
      base: 'http://synthetic.invalid',
      async close() {
        calls.push('server');
        if (serverFails) throw new Error('synthetic server close');
      },
    };
    const browser = {
      async newContext() {
        throw new Error('synthetic context failure');
      },
      async close() {
        calls.push('browser');
        throw new Error('synthetic browser close');
      },
    };
    const modules = {
      'node:fs': {
        existsSync: () => true,
        mkdtempSync: () => 'synthetic-fixture',
        rmSync: () => calls.push('fixture'),
      },
      'node:path': path,
      'node:assert/strict': assert,
      'node:child_process': { spawnSync: () => ({ status: 0 }) },
      jsonwebtoken: { sign: () => 'synthetic-token' },
      playwright: { chromium: { launch: async () => browser } },
      './helpers/startServer': { startServer: async () => fakeServer },
    };
    const context = require('node:vm').createContext({
      require: (name) => {
        assert.ok(Object.hasOwn(modules, name));
        return modules[name];
      },
      __dirname,
      module: {},
      process: { env: { WS_QA_PUBLIC_DIR: root, TMPDIR: scratch }, execPath: 'synthetic-node' },
      fetch: async () => ({ json: async () => ({ backendMatchesBuild: true }) }),
    });
    require('node:vm').runInContext(read('test/buildVisibility.e2e.js'), context);
    await assert.rejects(context.main(), serverFails ? /synthetic server close/ : /synthetic browser close/);
    assert.deepEqual(calls, ['browser', 'server', 'fixture']);
  });
}

test('synchronous spawn exception is sanitized too', async () => {
  await assert.rejects(
    startServer({
      spawnProcess() {
        throw Object.assign(new Error('synthetic-secret'), { code: 'ENOENT' });
      },
    }),
    (error) => {
      assert.match(error.message, /spawn failed.*ENOENT/);
      assert.doesNotMatch(error.message, /synthetic-secret/);
      return true;
    },
  );
});

function fakeStartupFailure(kind) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    process.nextTick(() => {
      child.stderr.write('EACCES ' + 'x'.repeat(9000));
      child.stderr.write(
        'synthetic-password=do-not-echo https://user:synthetic-secret@example.invalid MODULE_NOT_FOUND\n',
      );
      if (kind === 'spawn') child.emit('error', Object.assign(new Error('synthetic-secret'), { code: 'ENOENT' }));
      else child.emit('exit', 23, 'SIGTERM');
      child.emit('close', 23, 'SIGTERM');
    });
    return child;
  };
}
for (const kind of ['spawn', 'exit']) {
  test(`startup ${kind} diagnostics retain safe cause without raw secrets`, async () => {
    await assert.rejects(startServer({ spawnProcess: fakeStartupFailure(kind) }), (error) => {
      assert.match(error.message, kind === 'spawn' ? /ENOENT/ : /23.*SIGTERM/);
      assert.match(error.message, /stderr.*MODULE_NOT_FOUND/);
      assert.doesNotMatch(error.message, /synthetic-secret|do-not-echo|example.invalid|EACCES/);
      assert.ok(error.message.length < 512);
      return true;
    });
  });
}

// Exercise the real assembled server only in a child with an explicit, minimal
// environment: no .env file, persistent DB, model credentials or provider calls.
test('isolated authenticated HTTP smoke', { timeout: 20000 }, async () => {
  const artifact = selectSmokePublicDir(process.env.WS_QA_PUBLIC_DIR);
  let server;
  try {
    server = await startServer({ env: { WORSHIPSESSIONS_PUBLIC_DIR: artifact.publicDir } });
    const base = server.base;
    const request = (route, options) => fetch(base + route, { ...options, signal: AbortSignal.timeout(5000) });
    assert.equal((await request('/')).status, artifact.built ? 200 : 404);
    assert.equal((await request('/api/setlists')).status, 401);
    const credentials = { username: 'ci_smoke', password: randomBytes(20).toString('hex') };
    const post = (body) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await request('/api/auth/register', post(credentials))).status, 200);
    const login = await request('/api/auth/login', post(credentials));
    assert.equal(login.status, 200);
    const { token } = await login.json();
    assert.equal(typeof token, 'string');
    const lists = await request('/api/setlists', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(lists.status, 200);
    assert.ok(Array.isArray(await lists.json()));
    assert.equal((await request('/api/setlists', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  } finally {
    try {
      if (server) await server.close();
    } finally {
      artifact.cleanup();
    }
  }
});
