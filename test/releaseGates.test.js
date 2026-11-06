const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runReleaseChecks, releaseSteps } = require('../scripts/check-release');

const root = path.resolve(__dirname, '..');
test('release checks run in order with explicit working directories and no shell', () => {
  const calls = [];
  assert.equal(runReleaseChecks({ runner: (...args) => { calls.push(args); return { status: 0 }; }, log: () => {} }), 0);
  assert.deepEqual(releaseSteps.map((step) => step.name), ['staged-lint', 'frontend-types', 'frontend-tests', 'backend-tests']);
  assert.equal(calls.length, 4);
  for (const [command, args, options] of calls) {
    assert.equal(command, process.execPath);
    assert.equal(options.shell, false);
    assert.equal(options.stdio, 'inherit');
    assert.ok(Array.isArray(args));
  }
  assert.equal(calls[0][2].cwd, root);
  assert.equal(calls[1][2].cwd, path.join(root, 'frontend'));
  assert.equal(calls[2][2].cwd, path.join(root, 'frontend'));
  assert.equal(calls[3][2].cwd, root);
  assert.equal(calls[0][1][0], path.join(root, 'node_modules/lint-staged/bin/lint-staged.js'));
  assert.deepEqual(calls[1][1], [path.join(root, 'frontend/node_modules/typescript/bin/tsc'), '-b']);
  assert.equal(calls[3][2].env.DB_PATH, ':memory:');
  assert.equal(calls[3][2].env.WS_LIVE_VISION, '0');
});

for (let failure = 0; failure < 4; failure++) {
  test(`failure at gate ${failure + 1} prevents all later gates`, () => {
    let calls = 0;
    const code = runReleaseChecks({ runner: () => ({ status: calls++ === failure ? 7 : 0 }), log: () => {} });
    assert.equal(code, 7);
    assert.equal(calls, failure + 1);
  });
}
for (const result of [{ status: null, signal: 'SIGTERM' }, { error: new Error('ENOENT') }, undefined]) {
  test(`runner failure fails closed: ${result?.signal || result?.error?.message || 'no result'}`, () => {
    let calls = 0;
    assert.equal(runReleaseChecks({ runner: () => { calls++; return result; }, log: () => {} }), 1);
    assert.equal(calls, 1);
  });
}
test('runner exception fails closed', () => {
  assert.equal(runReleaseChecks({ runner: () => { throw new Error('spawn failed'); }, log: () => {} }), 1);
});
