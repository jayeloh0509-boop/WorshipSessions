const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// Stub only the subprocess boundary. These tests verify invocation and image
// transport, not OCR accuracy. The separate live smoke evidence is labelled.
const proc = require('../lib/procRun');
let invocation;
proc.run = async (command, args, options) => {
  const file = args[args.indexOf('--image') + 1];
  invocation = { command, args, options, file, bytes: await fs.readFile(file) };
  return { stdout: '{title: Transport test}\n{key: C}\n[C]Sing\n', stderr: '' };
};
const { importFileWithVision } = require('../lib/aiChartImport');

for (const [mime, extension] of [
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]) {
  test(`vision subprocess retains ${mime} encoding and uses the host subscription route`, async () => {
    const bytes = Buffer.from(`transport bytes for ${mime}`);
    const result = await importFileWithVision(bytes, `chart-pages${extension}`, mime);
    assert.deepEqual(invocation.bytes, bytes);
    assert.equal(path.extname(invocation.file), extension);
    assert.equal(invocation.args.includes('--provider'), false);
    assert.equal(invocation.args.includes('--model'), false);
    assert.equal(invocation.args[invocation.args.indexOf('--toolsets') + 1], 'vision');
    assert.equal(invocation.args[invocation.args.indexOf('--max-turns') + 1], '1');
    assert.equal(invocation.options.env.HERMES_YOLO_MODE, '0');
    assert.equal(result.provider, 'hermes');
    assert.equal(result.model, 'host-configured');
    assert.match(result.content, /\[C\]Sing/);
    // Cleanup is awaited below because the helper performs best-effort removal.
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!(await fs.stat(invocation.file).catch(() => null))) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await fs.stat(invocation.file).catch(() => null), null);
  });
}

test('unsupported image formats fail clearly without calling the model', async () => {
  invocation = null;
  await assert.rejects(
    importFileWithVision(Buffer.from('<svg/>'), 'chart.svg', 'image/svg+xml'),
    /Use PNG, JPEG or WebP/,
  );
  assert.equal(invocation, null);
});
