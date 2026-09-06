process.env.DB_PATH = ':memory:';

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
  return { userId: user.lastInsertRowid, songId: song.lastInsertRowid, setlistId: setlist.lastInsertRowid, entryId: entry.entry_id };
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
    arrangementConfirmed: true,
    keyConfirmed: true,
    transitionRehearsed: true,
    chartVerified: true,
  });

  const entry = Setlist.getEntries(fixture.setlistId)[0];
  assert.equal(entry.performance_key, 'Ab');
  assert.equal(entry.song_notes, 'Keys intro. Drums enter verse 2.');
  assert.equal(entry.transition_notes, 'Hold the final pad into prayer.');
  assert.equal(entry.arrangement_confirmed, 1);
  assert.equal(entry.key_confirmed, 1);
  assert.equal(entry.transition_rehearsed, 1);
  assert.equal(entry.chart_verified, 1);
  assert.equal(entry.content, '[C]Test');
});
test('deleted songs remain visible in their original position', () => {
  const fixture = createFixture();
  db.prepare('DELETE FROM songs WHERE id = ?').run(fixture.songId);
  const entries = Setlist.getEntries(fixture.setlistId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].song_id, null);
  assert.equal(entries[0].is_missing, 1);
});

test('service-flow sections persist, assign entries, reorder, delete safely, and duplicate', () => {
  const fixture = createFixture();
  const welcome = Setlist.createSection(fixture.setlistId, 'WELCOME');
  const worship = Setlist.createSection(fixture.setlistId, 'WORSHIP');
  Setlist.updateEntrySection(fixture.entryId, fixture.setlistId, worship.lastInsertRowid);
  Setlist.reorderSections(fixture.setlistId, [worship.lastInsertRowid, welcome.lastInsertRowid]);

  assert.deepEqual(Setlist.getSections(fixture.setlistId).map((section) => section.name), ['WORSHIP', 'WELCOME']);
  assert.equal(Setlist.getEntries(fixture.setlistId)[0].section_name, 'WORSHIP');

  const copy = Setlist.duplicate(fixture.setlistId, fixture.userId, 'Section Copy');
  assert.deepEqual(Setlist.getSections(copy.id).map((section) => section.name), ['WORSHIP', 'WELCOME']);
  assert.equal(Setlist.getEntries(copy.id)[0].section_name, 'WORSHIP');

  Setlist.deleteSection(worship.lastInsertRowid, fixture.setlistId);
  assert.equal(Setlist.getEntries(fixture.setlistId)[0].section_id, null);
});

test('setlist duplication preserves ordering, repeated entries, and preparation metadata', () => {
  const fixture = createFixture();
  Setlist.update(fixture.setlistId, fixture.userId, 'Sunday', 'private', null, 'Start softly; build into the response.');
  const second = db
    .prepare("INSERT INTO songs (user_id, title, content, visibility) VALUES (?, 'Second Song', '[G]Second', 'private')")
    .run(fixture.userId);
  const firstEntry = Setlist.getEntryById(fixture.entryId, fixture.setlistId);
  Setlist.updateSongEntry(fixture.entryId, fixture.setlistId, firstEntry, {
    transpose: 2,
    nashville: true,
    font: 18,
    twoCol: true,
    performanceKey: 'D',
    songNotes: 'Confirm ending.',
    transitionNotes: 'Count four.',
    arrangementConfirmed: true,
    keyConfirmed: true,
    transitionRehearsed: true,
    chartVerified: true,
  });
  Setlist.addSongEntry(fixture.setlistId, second.lastInsertRowid, { transpose: -1, nashville: false });
  Setlist.addSongEntry(fixture.setlistId, second.lastInsertRowid, { transpose: 0, nashville: false });

  const copy = Setlist.duplicate(fixture.setlistId, fixture.userId, 'Sunday Copy');
  assert.equal(copy.name, 'Sunday Copy');
  const source = Setlist.getEntries(fixture.setlistId);
  const duplicated = Setlist.getEntries(copy.id);
  assert.equal(duplicated.length, source.length);
  assert.deepEqual(duplicated.map((entry) => entry.position), source.map((entry) => entry.position));
  assert.equal(duplicated[0].transpose, 2);
  assert.equal(duplicated[0].font, 18);
  assert.equal(duplicated[0].two_col, 1);
  assert.equal(duplicated[0].song_notes, 'Confirm ending.');
  assert.equal(duplicated[0].transition_notes, 'Count four.');
  assert.equal(duplicated[0].arrangement_confirmed, 1);
  assert.equal(duplicated[0].key_confirmed, 1);
  assert.equal(duplicated[0].transition_rehearsed, 1);
  assert.equal(duplicated[0].chart_verified, 1);
  assert.equal(Setlist.findById(copy.id, fixture.userId).rehearsal_notes, 'Start softly; build into the response.');
});
