const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pdfTextToChordPro, importPdfBuffer } = require('../lib/pdfImport');
const { importWorshipTogetherPdf, convertWorshipTogetherText } = require('../lib/worshipTogetherImport');

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

test('supports original-key headers, copyright preambles, and bar notation', () => {
  const parsed = convertWorshipTogetherText(`CCLI #7147007
The Blessing (Peace Album)
Original Key: G | BPM: 65 | 4/4
Written by Kari Jobe, Cody Carnes
Intro
G / / / | C / / / | G/B / / / | D / / /
Verse 1
[G]The Lord bless you
`);
  assert.equal(parsed.title, 'The Blessing (Peace Album)');
  assert.match(parsed.content, /\{key: G\}/);
  assert.match(parsed.content, /\{tempo: 65\}/);
  assert.match(parsed.content, /\[G\].*\[C\].*\[G\/B\].*\[D\]/);
  assert.doesNotMatch(parsed.content, /CCLI|All Rights Reserved|Written by/);
});

test('supports dot-spaced chord-over-lyric layouts', () => {
  const parsed = convertWorshipTogetherText(`Copyright © Test
I Am Not Alone
Kari Jobe
E • 68 bpm • 4/4
Verse.1
C#m..................A.........F#m
When.I.walk.through.deep.waters
............................C#m..B..C#m
I.know.that.You.will.be.with.me
`);
  assert.equal(parsed.title, 'I Am Not Alone');
  assert.equal(parsed.key, 'E');
  assert.match(parsed.content, /^Verse 1$/m);
  assert.match(parsed.content, /\[C#m\] \[A\] \[F#m\]/);
  assert.match(parsed.content, /When I walk through deep waters/);
  assert.match(parsed.content, /\[C#m\] \[B\] \[C#m\]/);
  assert.match(parsed.content, /I know that You will be with me/);
});

test('supports parenthesized and extended chord symbols', () => {
  const input = `Nothing Else\nCody Carnes\nKey: G\n\nIntro\nAm7(4) C2 G Gsus G\nI'm caught up in Your presence\n(G2/B) Am7(4) C2\nI just want to sit here at Your feet\n`;
  const parsed = pdfTextToChordPro(input);
  assert.match(parsed.content, /\[Am7\(4\)\].*\[C2\].*\[G\].*\[Gsus\].*\[G\]/);
  assert.match(parsed.content, /I?\[G2\/B\].*\[Am7\(4\)\].*\[C2\]/);
});

test('importPdfBuffer extracts the real text-PDF fixture through discovered pdftotext', async () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'worship-together-text.pdf'));
  const result = await importPdfBuffer(fixture, 'worship-together-text.pdf');
  assert.equal(result.title, 'Living Hope');
  assert.equal(result.key, 'G');
  assert.match(result.content, /\[G\]/);
});

test('coordinate-aware extraction places chords before the governed lyric word', async () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'fall-like-rain-worship-together.pdf'));
  const parsed = await importWorshipTogetherPdf(fixture, 'fall_like_rain_passion_cc.pdf');
  assert.match(parsed.content, /\[Cm7\]Simple melodies of \[Ab2\]sacrifice/);
  assert.match(parsed.content, /\[Eb\]Fall like \[Bbsus\/D\]rain/);
  assert.doesNotMatch(parsed.content, /sacrifi\[Ab2\]ce/);
});

test('imports the real Fall Like Rain Worship Together PDF locally', async () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'fall-like-rain-worship-together.pdf'));
  const parsed = await importWorshipTogetherPdf(fixture, 'fall_like_rain_passion_cc.pdf');
  assert.equal(parsed.title, 'Fall Like Rain');
  assert.equal(parsed.key, 'Eb');
  assert.match(parsed.content, /\[Bb\/D\]All my life I offer You/);
  assert.match(parsed.content, /Fall like \[Bbsus\/D\]rain/);
  assert.match(parsed.content, /\{tempo: 70\}/);
  assert.doesNotMatch(parsed.content, /God,\.I\.live/);
});

test('imports the real two-column Always On Time Worship Together PDF in reading order', async () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'always-on-time-worship-together.pdf'));
  const parsed = await importWorshipTogetherPdf(fixture, 'always-on-time-pat-barrett-cc.pdf');
  assert.equal(parsed.title, 'Always On Time');
  assert.equal(parsed.artist, 'Steven Furtick, Jonathan Smith, Leeland Mooring, Pat Barrett');
  assert.equal(parsed.key, 'F');
  assert.match(parsed.content, /\{tempo: 68\}/);
  assert.match(parsed.content, /I \[F\]remember how You \[C\/F\]provided/);
  assert.match(parsed.content, /If I knew \[C\]then \[F\/A\]what I know \[Bb\]now/);
  assert.match(parsed.content, /^INSTRUMENTAL 1$/m);
  assert.match(parsed.content, /^BRIDGE \(4X\)$/m);
  assert.match(parsed.content, /There's never been a \[F\]day, never been a minute/);
  assert.doesNotMatch(parsed.content, /Copyright|All Rights Reserved/);
});
