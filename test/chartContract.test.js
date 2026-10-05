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

test('treats Repeat directives as arrangement lines, not unattached lyrics', () => {
  assert.equal(lineKind('Repeat Chorus'), 'repeat');
  assert.equal(lineKind('Repeat Bridge x2'), 'repeat');
  assert.equal(lineKind('Repeat Vamp 2 x2'), 'repeat');
  const chart = '{title: T}\n\nChorus\n[E]Hello\n\nRepeat Chorus\nRepeat Chorus x2';
  assert.equal(inspectChart(chart).status, 'verified');
});

test('recognises bracketed and bare bar notation as chord lines', () => {
  assert.equal(lineKind('[| G / / / | C / / / |]'), 'chord-only');
  assert.equal(lineKind('| E - - - | C#m7 - - - | x2'), 'chord-only');
  assert.equal(lineKind('| - - - |'), 'lyrics');
  const chart = 'Verse 1\n| E - - - |\nHere I am\n| A - - - |\nJesus';
  assert.equal(inspectChart(chart).status, 'verified');
});

test('allows a final chord-only line after a section label', () => {
  assert.equal(inspectChart('Ending\n[Eb]').status, 'verified');
});

test('still warns about chord-only lines before any section label', () => {
  const result = inspectChart('[E] [A] [B]\nHere I am');
  assert.ok(result.warnings.some((w) => w.code === 'unlabelled-chords'));
});

test('requireChord accepts a chart written purely in bare bar notation', () => {
  const { hasBracketChord } = require('../lib/chordSyntax');
  assert.equal(hasBracketChord('Intro\n| E - - - | C#m7 - - - |\nHere I am'), true);
  assert.equal(hasBracketChord('Verse 1\nJust words | with a pipe |'), false);
});

test('treats [N.C.], standalone X2 and {comment: Verse 1} as valid structure', () => {
  assert.equal(lineKind('[N.C.]'), 'chord-only');
  assert.equal(lineKind('X2'), 'repeat');
  assert.equal(lineKind('{comment: Verse 1}'), 'section');
  assert.equal(lineKind('{comment: hello there}'), 'metadata');
  assert.equal(inspectChart('{title: T}\n{comment: Verse 1}\n[G]Amazing grace').status, 'verified');
});
