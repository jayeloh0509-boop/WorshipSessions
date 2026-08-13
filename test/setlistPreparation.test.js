const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/db');
const Setlist = require('../lib/models/setlist');

function createFixture() {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const user = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(`prep_${suffix}`, 'hash');
  const song = db
    .prepare(
      "INSERT INTO songs (user_id, title, content, visibility) VALUES (?, 'Preparation Song', '[C]Test', 'private')",
    )
    .run(user.lastInsertRowid);
  const setlist = Setlist.create(user.lastInsertRowid, 'Sunday', 'private', null);
  const entry = Setlist.addSongEntry(setlist.lastInsertRowid, song.lastInsertRowid, { transpose: 0, nashville: false });
  return { userId: user.lastInsertRowid, setlistId: setlist.lastInsertRowid, entryId: entry.entry_id };
}

test('setlist entry preparation fields migrate into the database', () => {
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(setlist_songs)')
      .all()
      .map((column) => column.name),
  );
  assert.equal(columns.has('performance_key'), true);
  assert.equal(columns.has('song_notes'), true);
  assert.equal(columns.has('transition_notes'), true);
});

test('setlist entry preparation fields save without changing the song chart', () => {
  const fixture = createFixture();
  const before = Setlist.getEntryById(fixture.entryId, fixture.setlistId);

  Setlist.updateSongEntry(fixture.entryId, fixture.setlistId, before, {
    performanceKey: 'Ab',
    songNotes: 'Keys intro. Drums enter verse 2.',
    transitionNotes: 'Hold the final pad into prayer.',
  });

  const entry = Setlist.getEntries(fixture.setlistId)[0];
  assert.equal(entry.performance_key, 'Ab');
  assert.equal(entry.song_notes, 'Keys intro. Drums enter verse 2.');
  assert.equal(entry.transition_notes, 'Hold the final pad into prayer.');
  assert.equal(entry.content, '[C]Test');
});
