const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSongInput } = require('../lib/validation');

test('requireChord rejects content with no chords', () => {
  const err = validateSongInput({ content: 'just lyrics', requireContent: true, requireChord: true });
  assert.equal(err, 'No chords detected. Add chords (e.g. [C], [G]) before saving.');
});

test('requireChord accepts content containing a bracket chord', () => {
  const err = validateSongInput({ content: '[G]Amazing grace', requireContent: true, requireChord: true });
  assert.equal(err, null);
});

test('requireChord is skipped when content is absent', () => {
  const err = validateSongInput({ youtube_url: null, requireChord: true });
  assert.equal(err, null);
});

test('section labels alone do not count as chords', () => {
  const err = validateSongInput({ content: 'Chorus\nsome lyrics', requireContent: true, requireChord: true });
  assert.equal(err, 'No chords detected. Add chords (e.g. [C], [G]) before saving.');
});

test('requireChord rejects section labels such as Chorus and Bridge', () => {
  const err = validateSongInput({
    content: `[Chorus]
Lyrics only
[Bridge]
More lyrics`,
    requireContent: true,
    requireChord: true,
  });
  assert.equal(err, 'No chords detected. Add chords (e.g. [C], [G]) before saving.');
});
