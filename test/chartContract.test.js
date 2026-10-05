const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectChart, lineKind } = require('../lib/chartContract');

test('classifies standard ChordPro chart lines', () => {
  assert.equal(lineKind('{title: Test}'), 'metadata');
  assert.equal(lineKind('Verse 1'), 'section');
  assert.equal(lineKind('[E] [A] [B]'), 'chord-only');
  assert.equal(lineKind('[E]Here I am'), 'lyric-with-chords');
  assert.equal(lineKind('Here I am'), 'lyrics');
});

test('inspects a healthy chart without changing its content', () => {
  const chart = '{title: Test}\n\nIntro\n[E] [A] [B]\n[E]Here I am';
  const result = inspectChart(chart);
  assert.equal(result.status, 'verified');
  assert.equal(result.sections, 1);
  assert.equal(result.chordLines, 2);
  assert.deepEqual(result.warnings, []);
});

test('flags charts that need musician review', () => {
  const result = inspectChart('Here I am\n\n[E] [A]');
  assert.equal(result.status, 'needs-review');
  assert.ok(result.warnings.some((w) => w.code === 'missing-sections'));
  assert.ok(result.warnings.some((w) => w.code === 'orphan-chords'));
});
