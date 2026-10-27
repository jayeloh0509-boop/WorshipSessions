/*
 * Import the worship setlist chord charts into WorshipSessions.
 *
 * The insert goes through the app's own model layer using its documented
 * positional contract:
 *
 *     Song.create(userId, meta, content, visibility, formatDetected)
 *
 * so the content hash, the format detection and the row shape are the
 * app's own. The whole batch runs inside one SQLite transaction, and the
 * duplicate check follows the library's rule: owner + active status +
 * case-insensitive title and artist, plus the content hash.
 *
 * Charts come from several sources (Worship Together, open ChordPro
 * repositories), so each record's source attribution is written into the
 * chart body rather than into a fixed tag.
 *
 * Usage:
 *   node scripts/import-setlist-charts.js <records.json> [--dry-run]
 */
const path = require('path');
const fs = require('fs');

const APP = path.resolve(__dirname, '..');
const { db } = require(path.join(APP, 'lib', 'db'));
const Song = require(path.join(APP, 'lib', 'models', 'song'));
const { STATUS, VISIBILITY } = require(path.join(APP, 'lib', 'constants'));
const { computeSongHash } = require(path.join(APP, 'lib', 'songHash'));

const recordsPath = process.argv[2];
if (!recordsPath) {
  console.error('usage: node scripts/import-setlist-charts.js <records.json> [--dry-run]');
  process.exit(2);
}
const dryRun = process.argv.includes('--dry-run');
const records = JSON.parse(fs.readFileSync(recordsPath, 'utf8'));

// The owner of the existing library rows.
const OWNER_ID = 1;
const FORMAT = 'ChordPro';

const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();

// ── duplicate check: owner + active status + case-insensitive title ──────
const existing = db
  .prepare(
    `SELECT id, title, artist, content_hash
       FROM songs
      WHERE user_id = ? AND status = ?`,
  )
  .all(OWNER_ID, STATUS.ACTIVE);

const byTitle = new Map();
const existingHashes = new Set();
for (const row of existing) {
  const key = norm(row.title);
  if (!byTitle.has(key)) byTitle.set(key, []);
  byTitle.get(key).push(row);
  if (row.content_hash) existingHashes.add(row.content_hash);
}

// ── build the batch ───────────────────────────────────────────────────────
const skipped = [];
const batch = [];
const seenTitles = new Set();
const seenHashes = new Set();

for (const rec of records) {
  const content = String(rec.content || '').trim();
  if (!content) {
    skipped.push({ slug: rec.slug, title: rec.title, reason: 'empty-content' });
    continue;
  }

  const title = norm(rec.title);
  const artist = norm(rec.artist);
  const sameTitle = byTitle.get(title) || [];
  const sameArtist = sameTitle.filter((r) => norm(r.artist) === artist);
  if (sameArtist.length) {
    skipped.push({
      slug: rec.slug,
      title: rec.title,
      reason: 'duplicate-title-artist',
      existingId: sameArtist[0].id,
      existingTitle: sameArtist[0].title,
      existingArtist: sameArtist[0].artist,
    });
    continue;
  }

  const hash = computeSongHash(content);
  if (existingHashes.has(hash) || seenHashes.has(hash)) {
    skipped.push({ slug: rec.slug, title: rec.title, reason: 'duplicate-content-hash' });
    continue;
  }

  const titleArtist = `${title}|${artist}`;
  if (seenTitles.has(titleArtist)) {
    skipped.push({ slug: rec.slug, title: rec.title, reason: 'duplicate-in-batch' });
    continue;
  }
  seenTitles.add(titleArtist);
  seenHashes.add(hash);

  // The source attribution already lives in the chart's own header
  // directives, so the row tags stay uniform with the rest of the library.
  batch.push({
    meta: {
      title: rec.title,
      artist: rec.artist,
      key: rec.key || '',
      bpm: rec.bpm || null,
      youtube_url: null,
      tags: 'worship,verified-import',
      language: 'en',
    },
    content,
  });
}

console.log(`records in file       : ${records.length}`);
console.log(`skipped before insert : ${skipped.length}`);
console.log(`to insert             : ${batch.length}`);
for (const s of skipped) {
  console.log(
    `  skip ${String(s.slug || s.title)
      .slice(0, 46)
      .padEnd(46)} ${s.reason}${s.existingId ? ` (existing id ${s.existingId})` : ''}`,
  );
}

if (dryRun) {
  console.log('\nDRY RUN: nothing written.');
  process.exit(0);
}

// ── insert in one transaction ─────────────────────────────────────────────
const insertAll = db.transaction((rows) => {
  const ids = [];
  for (const row of rows) {
    const result = Song.create(OWNER_ID, row.meta, row.content, VISIBILITY.PUBLIC, FORMAT);
    ids.push(Number(result.lastInsertRowid));
  }
  return ids;
});

const ids = insertAll(batch);
console.log(`\ninserted rows         : ${ids.length}`);
if (ids.length) console.log(`id range               : ${ids[0]} .. ${ids[ids.length - 1]}`);

// ── read back ─────────────────────────────────────────────────────────────
const after = db
  .prepare('SELECT COUNT(*) AS n FROM songs WHERE user_id = ? AND status = ?')
  .get(OWNER_ID, STATUS.ACTIVE);
console.log(`active songs for ${OWNER_ID}    : ${after.n}`);

const sample = db
  .prepare(
    `SELECT id, title, artist, key, bpm, language, tags, visibility, status,
            format_detected, content_hash, length(content) AS len
       FROM songs
      WHERE id IN (${ids.slice(0, 4).join(',') || 'NULL'})`,
  )
  .all();
console.log('\nfirst imported rows:');
for (const s of sample) console.log(' ', JSON.stringify(s));

const nonPublic = db
  .prepare(
    `SELECT COUNT(*) AS n FROM songs
      WHERE user_id = ? AND visibility != ? AND status = ?`,
  )
  .get(OWNER_ID, VISIBILITY.PUBLIC, STATUS.ACTIVE);
console.log(`\nactive rows not public: ${nonPublic.n}`);

const integrity = db.prepare('PRAGMA integrity_check').get();
console.log('integrity_check       :', Object.values(integrity)[0]);
db.close();
