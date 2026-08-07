process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/db');
const User = require('../lib/models/user');
const Invite = require('../lib/models/invite');

function createUser(username) {
  return db
    .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, 'hash', 'user')")
    .run(username).lastInsertRowid;
}

test('sanity: invite FKs have no ON DELETE action, so a bare user delete fails', () => {
  const userId = createUser('fk-sanity');
  Invite.create('fk-sanity-code', userId);
  assert.throws(
    () => db.prepare('DELETE FROM users WHERE id = ?').run(userId),
    /FOREIGN KEY constraint failed/,
  );
  db.prepare('DELETE FROM invites WHERE code = ?').run('fk-sanity-code');
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
});

test('deleting a user who created invites nulls created_by and keeps the invites', () => {
  const adminId = createUser('inviter');
  Invite.create('code-created', adminId);

  const result = User.delete(adminId);
  assert.equal(result.changes, 1);
  assert.equal(User.findById(adminId), undefined);

  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get('code-created');
  assert.ok(invite, 'invite record is preserved');
  assert.equal(invite.created_by, null);
});

test('deleting a user who redeemed an invite nulls used_by and keeps used_at', () => {
  const adminId = createUser('inviter2');
  Invite.create('code-used', adminId);
  const { lastInsertRowid: newUserId } = Invite.redeem('code-used', 'redeemer', 'hash');

  const result = User.delete(newUserId);
  assert.equal(result.changes, 1);
  assert.equal(User.findById(newUserId), undefined);

  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get('code-used');
  assert.ok(invite, 'invite record is preserved');
  assert.equal(invite.used_by, null);
  assert.ok(invite.used_at, 'used_at still marks the invite as redeemed');
  assert.equal(invite.created_by, adminId, 'creator reference is untouched');
});

test('deletion still cascades songs, setlists, setlist_songs and the search index', () => {
  const userId = createUser('cascader');
  const keeperId = createUser('keeper');

  const songId = db
    .prepare("INSERT INTO songs (user_id, title, content) VALUES (?, 'Mine', '[G]la')")
    .run(userId).lastInsertRowid;
  const keeperSongId = db
    .prepare("INSERT INTO songs (user_id, title, content) VALUES (?, 'Keep', '[C]lo')")
    .run(keeperId).lastInsertRowid;
  const setlistId = db
    .prepare("INSERT INTO setlists (user_id, name) VALUES (?, 'Sunday')")
    .run(userId).lastInsertRowid;
  db.prepare('INSERT INTO setlist_songs (setlist_id, song_id, position) VALUES (?, ?, 1)').run(
    setlistId,
    songId,
  );

  User.delete(userId);

  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM songs WHERE user_id = ?').get(userId).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM setlists WHERE user_id = ?').get(userId).c, 0);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS c FROM setlist_songs WHERE setlist_id = ?').get(setlistId).c,
    0,
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS c FROM songs_search WHERE rowid = ?').get(songId).c,
    0,
    'FTS entry for the deleted song is removed',
  );
  assert.ok(db.prepare('SELECT id FROM songs WHERE id = ?').get(keeperSongId), 'other users keep their songs');
  db.prepare('DELETE FROM users WHERE id = ?').run(keeperId);
});

test('delete reports changes: 0 for a nonexistent user', () => {
  const result = User.delete(999999);
  assert.equal(result.changes, 0);
});

test('Invite.list still shows invites whose creator was deleted', () => {
  const adminId = createUser('gone-admin');
  Invite.create('orphaned-code', adminId);
  User.delete(adminId);

  const listed = Invite.list().find((i) => i.code === 'orphaned-code');
  assert.ok(listed, 'orphaned invite appears in the admin list');
  assert.equal(listed.created_by_username, null);
});
