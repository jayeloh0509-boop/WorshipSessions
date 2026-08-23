// Live-library structural contract: every real song in the dev database
// must be parseable, contain a key directive or first chord, and have a
// sane directive block. This is the backend counterpart of the frontend
// `chords.unified-format.test.ts` structural contract — it runs against
// the real SQLite library rather than a static fixture, and asserts the
// stored content is in good shape so the renderer never has to fall
// back to the unparseable surface in production.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const candidates = [
  path.join(__dirname, '..', 'data', 'worshipsessions.db'),
  path.join(__dirname, '..', '..', 'data', 'worshipsessions.db'),
];

function findDbPath() {
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function openDb() {
  const dbPath = findDbPath();
  return dbPath ? new Database(dbPath, { readonly: true, fileMustExist: true }) : null;
}

test(
  'every real song passes the unified-format structural contract',
  { skip: !findDbPath() && 'no dev database' },
  () => {
    const db = openDb();
    if (!db) return;
    try {
      const rows = db.prepare('SELECT id, title, content, key FROM songs ORDER BY id').all();
      assert.ok(rows.length >= 1, 'library must have at least one song');
      for (const row of rows) {
        const content = row.content || '';
        assert.ok(content.length > 0, `song ${row.id} (${row.title}) must have content`);

        // Every stored song must have a {key:} directive or at least one
        // bracketed chord so the renderer can derive a key. A song with
        // neither would fall back to the unparseable surface in production.
        const hasKeyDirective = /\{key:\s*\S/i.test(content);
        const hasBracketedChord = /\[[A-G][#b]?[^\]]*\]/.test(content);
        assert.ok(
          hasKeyDirective || hasBracketedChord || row.key,
          `song ${row.id} (${row.title}) must have a {key:} directive, a key column, or a bracketed chord`,
        );

        // The directive block must be at the top of the file. A directive
        // appearing after lyric lines would be ignored by the parser and
        // break the open-then-display contract.
        const lines = content.split('\n');
        let foundFirstContent = false;
        let directiveAfterContent = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '') continue;
          if (/^\{[a-z_]+:/i.test(trimmed)) {
            if (foundFirstContent) directiveAfterContent = true;
            continue;
          }
          foundFirstContent = true;
        }
        assert.equal(
          directiveAfterContent,
          false,
          `song ${row.id} (${row.title}) has a directive after its content begins`,
        );
      }
    } finally {
      db.close();
    }
  },
);

test('no real song uses the bare-VAR1 form that the canonicalizer rewrites', () => {
  // The canonicalizer turns `VERSE1`, `CHORUS2`, etc. into `Verse 1`,
  // `Chorus 2`, etc. on render. Stored content can still carry the
  // tight form (it parses fine), but no song should have the all-caps
  // form that historically looked inconsistent across charts.
  const db = openDb();
  if (!db) return;
  try {
    const rows = db.prepare('SELECT id, title, content FROM songs').all();
    const tightCapsRe =
      /(^|\s)\[(VERSE|CHORUS|BRIDGE|INTRO|OUTRO|TAG|ENDING|VAMP|REFRAIN|INTERLUDE|SOLO|BREAK|CODA|INSTRUMENTAL|PRECHORUS|HALFCHORUS|ALTVERSE)\d+\]/i;
    for (const row of rows) {
      assert.doesNotMatch(
        row.content || '',
        tightCapsRe,
        `song ${row.id} (${row.title}) contains a tight-caps section label that the canonicalizer will rewrite`,
      );
    }
  } finally {
    db.close();
  }
});
