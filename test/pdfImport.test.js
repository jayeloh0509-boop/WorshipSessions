const test = require('node:test');
const assert = require('node:assert/strict');
const { pdfTextToChordPro } = require('../lib/pdfImport');

const SAMPLE = `Amazing Grace
John Newton
Key: G

Verse 1
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [G]wretch like [D]me

Chorus
[G]I once was lost but [C]now am [G]found
Was [G]blind, but [D7]now I [G]see
`;

test('pdfTextToChordPro converts chords-over-lyrics with section labels', () => {
  const result = pdfTextToChordPro(SAMPLE);
  assert.equal(result.title, 'Amazing Grace');
  assert.equal(result.artist, 'John Newton');
  assert.equal(result.key, 'G');
  assert.match(result.content, /\{title: Amazing Grace\}/);
  assert.match(result.content, /\{x_language: en\}/);
  assert.match(result.content, /\{comment: Verse 1\}/);
  assert.match(result.content, /\[G\]Amazing \[G7\]grace, how \[C\]sweet the \[G\]sound/);
  assert.match(result.content, /\[G\]I once was lost but \[C\]now am \[G\]found/);
});

test('pdfTextToChordPro preserves inline ChordPro', () => {
  const input = '{title: Ready}\n{artist: Test}\n{key: A}\n\n[Am]Ready [F]now';
  const result = pdfTextToChordPro(input);
  assert.match(result.content, /\{title: Ready\}/);
  assert.match(result.content, /\[Am\]Ready \[F\]now/);
});

test('pdfTextToChordPro derives title from first non-empty line when missing', () => {
  const result = pdfTextToChordPro('Come Thou Fount\nVerse 1\n[D]Come thou [G]fount');
  assert.equal(result.title, 'Come Thou Fount');
  assert.match(result.content, /\[D\]Come thou \[G\]fount/);
});

test('pdfTextToChordPro surfaces a clean error for empty input', () => {
  assert.throws(() => pdfTextToChordPro(''), /PDF contained no extractable text/);
});

test('pdfTextToChordPro removes title and artist header lines from the song body', () => {
  const result = pdfTextToChordPro(SAMPLE);
  const body = result.content.split('\n\n').slice(1).join('\n\n');
  assert.doesNotMatch(body, /^Amazing Grace$/m);
  assert.doesNotMatch(body, /^John Newton$/m);
});

test('pdfTextToChordPro accepts a single chord above a lyric line', () => {
  const input = `Build My Life\nHousefires\nKey: G\n\nVerse 1\nG\nWorthy of every song we could ever sing\n`;
  const result = pdfTextToChordPro(input);
  assert.match(result.content, /\[G\]Worthy of every song we could ever sing/);
});

test('pdfTextToChordPro accepts bar-delimited chord lines and extended chords', () => {
  const input = `Test Song\nTest Artist\nKey: Bb\n\nChorus\n| Bb2 | F/A | Gm7 | Ebmaj7 |\nSing a new song to the Lord\n`;
  const result = pdfTextToChordPro(input);
  assert.match(result.content, /\[Bb2\].*\[F\/A\].*\[Gm7\].*\[Ebmaj7\]/);
  const renderedLine = result.content.split('\n').find((line) => line.includes('[Bb2]'));
  assert.equal(renderedLine.replace(/\[[^\]]+\]/g, ''), 'Sing a new song to the Lord');
});