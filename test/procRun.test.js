const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../lib/procRun');

test('subprocess failure retains stdout diagnostics even when stderr contains a startup warning', async () => {
  await assert.rejects(
    run(process.execPath, [
      '-e',
      'console.error("Startup warning"); console.log("Actual model connection error"); process.exit(1)',
    ]),
    (error) => {
      assert.match(error.message, /Startup warning/);
      assert.match(error.message, /Actual model connection error/);
      assert.equal(error.exitCode, 1);
      return true;
    },
  );
});
