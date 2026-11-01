// Opt in explicitly: this test uses the host's existing authenticated model
// subscription. It is real inference, not an OCR mock, and never saves a song.
const test = require('node:test');
const assert = require('node:assert/strict');

if (process.env.WS_LIVE_VISION !== '1') {
  test.skip('live authenticated vision import (set WS_LIVE_VISION=1 to use the host subscription)', () => {});
} else {
  process.env.DB_PATH = ':memory:';
  process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  const fs = require('node:fs');
  const path = require('node:path');
  const express = require('express');
  const request = require('supertest');
  const jwt = require('jsonwebtoken');
  const { db } = require('../lib/db');
  const { createSongsRouter } = require('../routes/songs');
  const { withSkipGlobal, exportLimiter } = require('../lib/rateLimiter');

  test(
    'real authenticated image upload transcribes the synthetic chart through the host subscription without persistence',
    { timeout: 150000 },
    async () => {
      const id = db
        .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
        .run('vision-smoke-only', 'test-only-no-login', 'user').lastInsertRowid;
      const token = jwt.sign({ id, username: 'vision-smoke-only' }, process.env.JWT_SECRET, { expiresIn: '5m' });
      const app = express();
      app.use('/api', createSongsRouter({ withSkipGlobal, exportLimiter }));
      const before = db.prepare('SELECT COUNT(*) AS count FROM songs').get().count;
      const started = Date.now();
      const response = await request(app)
        .post('/api/songs/import-chart')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'image/jpeg')
        .set('X-Filename', 'chart.jpg')
        .send(fs.readFileSync(path.join(__dirname, 'fixtures', 'chart.jpg')));
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.method, 'vision');
      assert.equal(response.body.provider, 'hermes');
      assert.equal(response.body.model, 'host-configured');
      const content = response.body.content;
      assert.match(content, /\{title:\s*Living Hope\}/);
      assert.match(content, /\{artist:\s*Phil Wickham\}/);
      assert.match(content, /\{key:\s*G\}/);
      assert.deepEqual(
        [...content.matchAll(/\[([A-G][^\]]*)\]/g)].map((match) => match[1]),
        ['G', 'C', 'Em', 'D', 'G', 'D', 'Em', 'C'],
      );
      const lyrics = content
        .replace(/\{[^}]*\}/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\s+/g, '');
      for (const line of [
        'How great the chasm that lay between us',
        'How high the mountain I could not climb',
        'Hallelujah praise the One who set me free',
      ])
        assert.ok(lyrics.includes(line.replace(/\s+/g, '')), line);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM songs').get().count, before);
      if (process.env.WS_FIDELITY_OUTPUT) {
        fs.mkdirSync(process.env.WS_FIDELITY_OUTPUT, { recursive: true });
        fs.writeFileSync(
          path.join(process.env.WS_FIDELITY_OUTPUT, 'live-authenticated-vision.json'),
          JSON.stringify(
            {
              fixtureType: 'synthetic raster; not a camera photo',
              method: response.body.method,
              provider: response.body.provider,
              model: response.body.model,
              content,
              elapsedMs: Date.now() - started,
              libraryWrites: 0,
            },
            null,
            2,
          ),
        );
      }
    },
  );
}
