const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCatalog, parseChart, rankPopularSongs } = require('../lib/publicCatalog');

const catalogHtml = `
<a href="https://worshipchordbook.com/hymns/amazing-grace" class="wk-card wk-card--link">
  <p class="song-card-title"> Amazing Grace </p>
  <p class="song-card-author">John Newton, William Walker</p>
  <span class="song-card-key">G</span>
  <span class="card-tag">Traditional</span><span class="card-tag">Worship</span>
  <span>Public Domain</span>
</a>`;

const chartHtml = `
<h1>Abide With Me</h1>
<p class="hymn-author">Henry Francis Lyte, William Henry Monk</p>
<span class="arr-key">G</span>
<div class="chord-chart">
  <p class="section-label">Verse 1</p>
  <p class="chord-line has-chords"><span class="chord-token">G</span><span class="lyric-text">A-bide with </span><span class="chord-token">D</span><span class="lyric-text">me</span></p>
  <div class="chord-blank"></div>
  <p class="section-label">Verse 2</p>
  <p class="chord-line has-chords"><span class="lyric-text">The </span><span class="chord-token">C</span><span class="lyric-text">darkness falls</span></p>
</div>`;

test('parseCatalog returns searchable public-domain chart metadata', () => {
  assert.deepEqual(parseCatalog(catalogHtml), [{
    slug: 'amazing-grace', title: 'Amazing Grace', artist: 'John Newton, William Walker', key: 'G',
    tags: ['Traditional', 'Worship'], source: 'WorshipChordBook', license: 'Public Domain',
  }]);
});

test('parseChart converts public chart HTML into editable ChordPro', () => {
  const result = parseChart(chartHtml, 'abide-with-me');
  assert.equal(result.title, 'Abide With Me');
  assert.equal(result.artist, 'Henry Francis Lyte, William Henry Monk');
  assert.equal(result.key, 'G');
  assert.match(result.content, /\{title: Abide With Me\}/);
  assert.match(result.content, /\{x_language: en\}/);
  assert.match(result.content, /\{comment: Verse 1\}/);
  assert.match(result.content, /\[G\]A-bide with \[D\]me/);
  assert.match(result.content, /The \[C\]darkness falls/);
});

test('parseChart rejects pages without a chord chart', () => {
  assert.throws(() => parseChart('<h1>Missing</h1>', 'missing'), /Chord chart not found/);
});

test('rankPopularSongs returns familiar hymns in curated order and skips unavailable entries', () => {
  const songs = [
    { slug: 'be-thou-my-vision', title: 'Be Thou My Vision' },
    { slug: 'unknown-hymn', title: 'Unknown Hymn' },
    { slug: 'amazing-grace', title: 'Amazing Grace' },
    { slug: 'blessed-assurance', title: 'Blessed Assurance' },
  ];
  assert.deepEqual(rankPopularSongs(songs).map((song) => song.slug), [
    'amazing-grace', 'be-thou-my-vision', 'blessed-assurance',
  ]);
});
