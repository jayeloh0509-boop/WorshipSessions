// Regression test for a fixed access-control bug: PUT /songs/:id used to update
// ANY song by id with no ownership check (routes/songs.js called Song.update()
// with no user scoping, and lib/models/song.js's updateStmt had no user_id clause).
// This exercises the actual HTTP route + Express middleware stack, not just the
// model layer, since the bug lived in the route/middleware wiring.
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-song-ownership';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { db } = require('../lib/db');
const { createSongsRouter } = require('../routes/songs');
const { withSkipGlobal, exportLimiter } = require('../lib/rateLimiter');

const JWT_SECRET = process.env.JWT_SECRET;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createSongsRouter({ withSkipGlobal, exportLimiter }));
  return app;
}

const app = buildApp();

function createUser(username, role = 'user') {
  const hash = bcrypt.hashSync('password123', 4); // low cost factor: speed, not security, for tests
  const id = db
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, hash, role).lastInsertRowid;
  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
  return { id, username, token };
}

test('PUT /songs/:id rejects updates from a user who does not own the song', async () => {
  const owner = createUser('owner-a');
  const intruder = createUser('intruder-b');

  const createRes = await request(app)
    .post('/api/songs')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ content: '{title: Original Song}\n[C]Hello [G]world', visibility: 'public' });
  assert.equal(createRes.status, 200, JSON.stringify(createRes.body));
  const songId = createRes.body.id;

  // The intruder attempts to overwrite the owner's song via PUT.
  const attackRes = await request(app)
    .put(`/api/songs/${songId}`)
    .set('Authorization', `Bearer ${intruder.token}`)
    .send({ content: '{title: Hijacked}\n[C]Hacked [G]content' });

  assert.equal(
    attackRes.status,
    404,
    `expected the non-owner update to be rejected, got ${attackRes.status}: ${JSON.stringify(attackRes.body)}`,
  );

  // Prove the attack didn't silently partially-apply: content in the DB is untouched.
  const row = db.prepare('SELECT title, content FROM songs WHERE id = ?').get(songId);
  assert.equal(row.title, 'Original Song');
  assert.match(row.content, /Hello/);
  assert.doesNotMatch(row.content, /Hacked/);
});

test('PUT /songs/:id still lets the real owner update their own song', async () => {
  const owner = createUser('owner-c');

  const createRes = await request(app)
    .post('/api/songs')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ content: '{title: Owned Song}\n[C]Hello [G]world', visibility: 'public' });
  const songId = createRes.body.id;

  const updateRes = await request(app)
    .put(`/api/songs/${songId}`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ content: '{title: Updated By Owner}\n[C]Hello [G]again' });

  assert.equal(updateRes.status, 200, JSON.stringify(updateRes.body));
  const row = db.prepare('SELECT title FROM songs WHERE id = ?').get(songId);
  assert.equal(row.title, 'Updated By Owner');
});

test('PUT /songs/:id still lets an admin update a song they do not own', async () => {
  const owner = createUser('owner-d');
  const admin = createUser('admin-e', 'admin');

  const createRes = await request(app)
    .post('/api/songs')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ content: '{title: Admin Target}\n[C]Hello [G]world', visibility: 'public' });
  const songId = createRes.body.id;

  const adminUpdateRes = await request(app)
    .put(`/api/songs/${songId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ content: '{title: Fixed By Admin}\n[C]Hello [G]again' });

  assert.equal(adminUpdateRes.status, 200, JSON.stringify(adminUpdateRes.body));
  const row = db.prepare('SELECT title FROM songs WHERE id = ?').get(songId);
  assert.equal(row.title, 'Fixed By Admin');
});

test('PUT /songs/:id returns 404 for a nonexistent song id', async () => {
  const owner = createUser('owner-f');

  const res = await request(app)
    .put('/api/songs/999999')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ content: '{title: Ghost}\n[C]Hello [G]world' });

  assert.equal(res.status, 404);
});
