const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanChordPro, providers } = require('../lib/aiChartImport');

test('cleanChordPro removes markdown fences and accepts a structured chart', () => {
  const result = cleanChordPro('```chordpro\n{title: Test}\n{x_language: en}\n\n[G]Sing\n```');
  assert.equal(result, '{title: Test}\n{x_language: en}\n\n[G]Sing\n');
});

test('cleanChordPro rejects prose or a result without chords', () => {
  assert.throws(() => cleanChordPro('I could not read the chart'), /no usable musical chords/i);
});

test('cleanChordPro rejects section labels that merely start with note letters', () => {
  assert.throws(
    () =>
      cleanChordPro(`{title: Lyrics Only}
{x_language: en}

[Chorus]
Only lyrics here
[Bridge]
More lyrics`),
    /no usable musical chords/i,
  );
});
test('vision import inherits the authenticated host route rather than hardcoding a paid third-party provider', () => {
  assert.deepEqual(providers(), [{ id: 'hermes', provider: null, model: null }]);
});
