/*
 * Publish the changelog entry for the worship setlist chart import.
 *
 * Goes through the app's own Changelog model so the entry gets the same
 * shape and publishing behaviour as every other entry.
 *
 * Usage: node scripts/create-changelog-entry.js
 */
const path = require('path');
const { db } = require(path.join(__dirname, '..', 'lib', 'db'));
const Changelog = require(path.join(__dirname, '..', 'lib', 'models', 'changelog'));

const VERSION = '2026.10.28';
const TITLE = 'Worship setlist chart library';

const SUMMARY =
  'Imported 148 chord charts from the worship setlist workbook, covering ' +
  'Bethel Music, Jesus Culture, Passion, Kari Jobe, Chris Tomlin, The ' +
  'Belonging Co, UPPERROOM, Hillsong and more.';

const BODY = `**Worship setlist chart library**

Imported 148 chord charts drawn from the worship setlist workbook, bringing
the library to 401 songs.

**Sources**

- Worship Together — 77 charts, with the site's own key, tempo, album and
  publisher metadata
- open-worship-songs, mattgraham/worship and joeycortez42/worship — 71
  charts from the open ChordPro collections, covering songs Worship Together
  does not carry

**What changed**

- 148 new songs, all public and active
- Every chart converted to the house ChordPro format: metadata directives
  before the content, plain section labels, and chords kept attached to the
  lyric fragment they belong to
- Section labels are normalised to the vocabulary the app renders as
  headings, so no chart shows a stray label where a heading belongs
- 34 songs already in the library were left untouched rather than
  duplicated

**Known gaps**

Some songs in the setlist have no chart available from a lawful public
source — mostly recent Bethel Music and Encounter Worship releases that sit
behind publisher paywalls, plus a handful of songs written by the worship
leaders themselves. Those were left out rather than filled with a chart for
a different song.
`;

const entry = Changelog.create(
  {
    version: VERSION,
    title: TITLE,
    summary: SUMMARY,
    body: BODY,
  },
  1,
);

Changelog.publish(entry.id, 1);

const readback = Changelog.get(entry.id);
console.log('id           :', readback.id);
console.log('version      :', readback.version);
console.log('title        :', readback.title);
console.log('status       :', readback.status);
console.log('published_at :', readback.published_at);
console.log('summary      :', readback.summary);
db.close();
