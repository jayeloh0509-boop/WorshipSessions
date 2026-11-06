const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { db } = require('../lib/db');
const User = require('../lib/models/user');
const { createOperationsRouter } = require('../routes/operations');
const buildInfo = { buildId: 'ws-fixture', revision: null, sourceState: 'unknown', backendMatchesBuild: null };
let probes = 0;
const app = express();
app.use(
  '/api',
  createOperationsRouter({
    db,
    buildInfo,
    root: __dirname,
    runtimeProbe: async () => {
      probes += 1;
      return {
        database: { quickCheck: 'ok' },
        pdf: { python: true, pymupdf: false, poppler: true },
        vision: { inferenceTested: false },
      };
    },
  }),
);
function token(role) {
  const result = User.create('ops-' + role, 'test-fixture-not-a-login', role);
  return jwt.sign({ id: Number(result.lastInsertRowid) }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

test('public health/build contain only safe metadata and do not run dependency probes', async () => {
  const response = await request(app).get('/api/build');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, buildInfo);
  assert.equal(response.headers['cache-control'], 'no-store');
  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(probes, 0);
});

test('only owner can request sanitized runtime diagnostics; repeated checks reuse a bounded probe', async () => {
  assert.equal((await request(app).get('/api/admin/runtime-status')).status, 401);
  for (const role of ['user', 'admin']) {
    const response = await request(app)
      .get('/api/admin/runtime-status')
      .set('Authorization', 'Bearer ' + token(role));
    assert.equal(response.status, 403);
  }
  assert.equal(probes, 0);
  const auth = 'Bearer ' + token('owner');
  const response = await request(app).get('/api/admin/runtime-status').set('Authorization', auth);
  assert.equal(response.status, 200);
  assert.equal(response.body.pdf.pymupdf, false);
  assert.equal(response.body.vision.inferenceTested, false);
  assert.equal((await request(app).get('/api/admin/runtime-status').set('Authorization', auth)).status, 200);
  assert.equal(probes, 1);
});

test('health failures are unavailable without exposing database error details', async () => {
  const broken = express();
  broken.use(
    createOperationsRouter({
      db: {
        prepare() {
          throw new Error('PRIVATE secret/path');
        },
      },
      buildInfo,
      root: __dirname,
    }),
  );
  const response = await request(broken).get('/health');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { status: 'unavailable' });
});
