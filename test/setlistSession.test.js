process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-setlist-session';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { db } = require('../lib/db');
const Setlist = require('../lib/models/setlist');
const SetlistSession = require('../lib/setlistSession');
const { createSetlistsRouter } = require('../routes/setlists');

const app = express();
app.use(express.json());
app.use('/api', createSetlistsRouter());

function createUser(username) {
  const id = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, 'hash').lastInsertRowid;
  return { id, username, token: jwt.sign({ id, username }, process.env.JWT_SECRET, { expiresIn: '1d' }) };
}

function createSetlist(owner, visibility, titles = ['One', 'Two', 'Three']) {
  const setlist = Setlist.create(owner.id, 'Sunday', visibility, null);
  const setlistId = Number(setlist.lastInsertRowid);
  const entryIds = titles.map((title) => {
    const songId = db
      .prepare("INSERT INTO songs (user_id, title, content, visibility) VALUES (?, ?, '[C]Hi', 'public')")
      .run(owner.id, title).lastInsertRowid;
    return Number(Setlist.addSongEntry(setlistId, songId, { transpose: 0, nashville: false }).entry_id);
  });
  return { setlistId, entryIds };
}

const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

test.beforeEach(() => SetlistSession.reset());

test('session endpoints require authentication', async () => {
  for (const method of ['get', 'put', 'delete']) {
    const res = await request(app)[method]('/api/setlists/1/session');
    assert.equal(res.status, 401, method);
  }
});

test('with no leader the session reports inactive', async () => {
  const owner = createUser('ss-owner-0');
  const { setlistId } = createSetlist(owner, 'private');
  const res = await request(app).get(`/api/setlists/${setlistId}/session`).set(auth(owner));
  assert.equal(res.status, 200);
  assert.equal(res.body.active, false);
  assert.equal(res.body.is_owner, true);
});

test('the owner leads and a follower on a public setlist sees the position', async () => {
  const owner = createUser('ss-owner-1');
  const follower = createUser('ss-follower-1');
  const { setlistId, entryIds } = createSetlist(owner, 'public');

  const push = await request(app)
    .put(`/api/setlists/${setlistId}/session`)
    .set(auth(owner))
    .send({ entry_id: entryIds[1], index: 1 });
  assert.equal(push.status, 200, JSON.stringify(push.body));
  assert.equal(push.body.active, true);

  const view = await request(app).get(`/api/setlists/${setlistId}/session`).set(auth(follower));
  assert.equal(view.status, 200);
  assert.equal(view.body.active, true);
  assert.equal(view.body.index, 1);
  assert.equal(view.body.entry_id, entryIds[1]);
  assert.equal(view.body.host, 'ss-owner-1');
  assert.equal(view.body.is_owner, false);
});

test('a follower cannot lead or end a session', async () => {
  const owner = createUser('ss-owner-2');
  const follower = createUser('ss-follower-2');
  const { setlistId, entryIds } = createSetlist(owner, 'public');
  const put = await request(app)
    .put(`/api/setlists/${setlistId}/session`)
    .set(auth(follower))
    .send({ entry_id: entryIds[0], index: 0 });
  assert.equal(put.status, 403);
  const del = await request(app).delete(`/api/setlists/${setlistId}/session`).set(auth(follower));
  assert.equal(del.status, 403);
});

test('a private setlist is invisible to other users', async () => {
  const owner = createUser('ss-owner-3');
  const stranger = createUser('ss-stranger-3');
  const { setlistId, entryIds } = createSetlist(owner, 'private');
  await request(app)
    .put(`/api/setlists/${setlistId}/session`)
    .set(auth(owner))
    .send({ entry_id: entryIds[0], index: 0 });
  const res = await request(app).get(`/api/setlists/${setlistId}/session`).set(auth(stranger));
  assert.equal(res.status, 404);
});

test('rejects a position that does not match the setlist', async () => {
  const owner = createUser('ss-owner-4');
  const { setlistId, entryIds } = createSetlist(owner, 'private');
  const bad = [
    { entry_id: entryIds[0], index: 2 }, // wrong entry for that slot
    { entry_id: entryIds[0], index: 99 }, // out of range
    { entry_id: entryIds[0], index: -1 },
    { entry_id: 'x', index: 0 },
    {},
  ];
  for (const body of bad) {
    const res = await request(app).put(`/api/setlists/${setlistId}/session`).set(auth(owner)).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('ending the session makes it inactive again', async () => {
  const owner = createUser('ss-owner-5');
  const { setlistId, entryIds } = createSetlist(owner, 'private');
  await request(app)
    .put(`/api/setlists/${setlistId}/session`)
    .set(auth(owner))
    .send({ entry_id: entryIds[2], index: 2 });
  const del = await request(app).delete(`/api/setlists/${setlistId}/session`).set(auth(owner));
  assert.equal(del.status, 200);
  assert.equal(del.body.active, false);
});

test('long-poll answers immediately when the caller is behind', async () => {
  SetlistSession.push(7, { hostName: 'h', entryId: 1, index: 0 });
  const state = await SetlistSession.wait(7, 0, { timeoutMs: 5000 });
  assert.equal(state.active, true);
});

test('long-poll wakes when the leader moves', async () => {
  const first = SetlistSession.push(8, { hostName: 'h', entryId: 1, index: 0 });
  const pending = SetlistSession.wait(8, first.version, { timeoutMs: 5000 });
  setTimeout(() => SetlistSession.push(8, { hostName: 'h', entryId: 2, index: 1 }), 20);
  const state = await pending;
  assert.equal(state.index, 1);
  assert.ok(state.version > first.version);
});

test('long-poll times out with the unchanged state', async () => {
  const first = SetlistSession.push(9, { hostName: 'h', entryId: 1, index: 0 });
  const state = await SetlistSession.wait(9, first.version, { timeoutMs: 30 });
  assert.equal(state.version, first.version);
  assert.equal(state.index, 0);
});

test('a repeated ping at the same position does not wake followers', async () => {
  const first = SetlistSession.push(10, { hostName: 'h', entryId: 1, index: 0 });
  const again = SetlistSession.push(10, { hostName: 'h', entryId: 1, index: 0 });
  assert.equal(again.version, first.version);
});

test('a leader who stops pinging goes stale', () => {
  const t0 = 1_000_000;
  SetlistSession.push(11, { hostName: 'h', entryId: 1, index: 0 }, t0);
  assert.equal(SetlistSession.snapshot(11, t0 + 1000).active, true);
  assert.equal(SetlistSession.snapshot(11, t0 + SetlistSession.STALE_MS + 1).active, false);
});

test('ending a session wakes waiting followers', async () => {
  const first = SetlistSession.push(12, { hostName: 'h', entryId: 1, index: 0 });
  const pending = SetlistSession.wait(12, first.version, { timeoutMs: 5000 });
  setTimeout(() => SetlistSession.end(12), 20);
  const state = await pending;
  assert.equal(state.active, false);
});
