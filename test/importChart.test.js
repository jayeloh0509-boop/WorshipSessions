// Regression coverage for the unified chart-import endpoint: one route
// (/api/songs/import-chart) now handles everything that used to be split
// across /songs/import-pdf (Worship Together button) and /songs/import-vision
// (general button). PDFs always try the local parsing tiers first —
// Worship-Together-specific parser, then a generic text-PDF parser — before
// falling back to vision recognition; images go straight to vision. This
// file proves no format lost capability in the merge, and specifically that
// a real Worship Together PDF still gets parsed and tagged correctly (via
// the response's `method` field) without going through a dedicated button.
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-import-chart';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock the vision recognition entry points BEFORE requiring routes/songs.js,
// since that module destructures these functions at require time — mocking
// the exported properties afterwards would not be picked up. Vision itself
// shells out to an external CLI that isn't available in CI/dev sandboxes, so
// this is the same boundary the rest of the suite avoids crossing (see
// test/aiChartImport.test.js, which only exercises the pure helpers).
const aiChartImport = require('../lib/aiChartImport');
const visionCalls = [];
mock.method(aiChartImport, 'importFileWithVision', async (buffer, filename, mimeType) => {
  visionCalls.push({ filename, mimeType });
  return {
    content: '{title: Vision Song}\n{artist: Vision Artist}\n{key: D}\n{x_language: en}\n\n[D]Recognized by vision',
    provider: 'theclawbay',
    model: 'gpt-5.6-sol',
  };
});
mock.method(aiChartImport, 'importPdfWithVision', (buffer, filename) =>
  aiChartImport.importFileWithVision(buffer, filename, 'application/pdf'),
);

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

function authToken(username) {
  const hash = bcrypt.hashSync('password123', 4);
  const id = db
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, hash, 'user').lastInsertRowid;
  return jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
}

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

test('a real Worship Together PDF is recognized via the local WT-specific parser, with no dedicated button', async () => {
  const token = authToken('wt-user');
  const res = await request(app)
    .post('/api/songs/import-chart')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/pdf')
    .set('X-Filename', 'fall_like_rain_passion_cc.pdf')
    .send(fixture('fall-like-rain-worship-together.pdf'));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.method, 'worship-together-text');
  assert.equal(res.body.title, 'Fall Like Rain');
  assert.equal(res.body.key, 'Eb');
  assert.match(res.body.content, /\[Bb\/D\]All my life I offer You/);
  assert.match(res.body.content, /Fall like \[Bbsus\/D\]rain/);
  assert.equal(res.body.language, 'en');
});

test('a generic text-based PDF still imports locally (no vision needed)', async () => {
  // This fixture has bracket chords, so the WT-specific parser (tried first)
  // "succeeds" on it without throwing — pre-existing behavior, unchanged by
  // this merge. It's not really Worship-Together-shaped, so that parser's
  // narrower heuristics (e.g. a "Key • BPM" summary line) don't pick up the
  // key here the way the generic parser (lib/pdfImport.js) does. The point of
  // this test is that either local tier avoids vision entirely, not which one wins.
  const token = authToken('text-pdf-user');
  const res = await request(app)
    .post('/api/songs/import-chart')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/pdf')
    .set('X-Filename', 'worship-together-text.pdf')
    .send(fixture('worship-together-text.pdf'));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.method, 'local');
  assert.equal(res.body.key, 'G');
  assert.equal(res.body.title, 'Living Hope');
  assert.match(res.body.content, /\[G\]/);
  assert.equal(visionCalls.length, 0, 'vision should not have been called for a locally-parseable PDF');
});

test('a scanned (image-only) PDF falls through both local tiers to vision', async () => {
  visionCalls.length = 0;
  const token = authToken('scan-user');
  const res = await request(app)
    .post('/api/songs/import-chart')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/pdf')
    .set('X-Filename', 'worship-together-scan.pdf')
    .send(fixture('worship-together-scan.pdf'));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.method, 'vision');
  assert.equal(res.body.provider, 'theclawbay');
  assert.equal(res.body.model, 'gpt-5.6-sol');
  assert.equal(res.body.title, 'Vision Song');
  assert.equal(visionCalls.length, 1, 'vision should have been reached exactly once after both local tiers failed');
});

test('an image upload goes straight to vision, skipping local PDF tiers entirely', async () => {
  visionCalls.length = 0;
  const token = authToken('image-user');
  const res = await request(app)
    .post('/api/songs/import-chart')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/jpeg')
    .set('X-Filename', 'chart.jpg')
    .send(fixture('chart.jpg'));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.method, 'vision');
  assert.equal(res.body.title, 'Vision Song');
  assert.equal(res.body.artist, 'Vision Artist');
  assert.equal(visionCalls.length, 1);
  assert.equal(visionCalls[0].mimeType, 'image/jpeg');
});

test('rejects an empty upload', async () => {
  const token = authToken('empty-user');
  const res = await request(app)
    .post('/api/songs/import-chart')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/pdf')
    .send(Buffer.alloc(0));

  assert.equal(res.status, 400);
});
