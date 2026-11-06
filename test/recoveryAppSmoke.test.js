const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');
const { backupDatabase, verifyBackup } = require('../lib/databaseBackup');
const { startServer } = require('./helpers/startServer');

const root = path.resolve(__dirname, '..');
test(
  'a recovered current-schema snapshot serves private songs and preparation with original permissions',
  { timeout: 30000 },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ws-recovered-app-'));
    const backupDir = path.join(dir, 'backups');
    const recoveryDir = path.join(dir, 'recovery');
    fs.mkdirSync(backupDir);
    fs.mkdirSync(recoveryDir);
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'synthetic.sqlite');
    const backup = path.join(backupDir, 'snapshot.sqlite');
    const recovered = path.join(recoveryDir, 'recovered.sqlite');
    const seed = spawnSync(
      process.execPath,
      [
        '-e',
        `
    const {db}=require('./lib/db');
    db.prepare('INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)').run(101,'fixture-owner','not-a-login','owner');
    db.prepare('INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)').run(102,'fixture-reader','not-a-login','user');
    db.prepare('INSERT INTO songs(id,user_id,title,content,key,visibility,format_detected) VALUES(?,?,?,?,?,?,?)').run(201,101,'Recovery fixture','{key: D}\\n[D]Synthetic words','D','private','chordpro');
    db.prepare('INSERT INTO setlists(id,user_id,name,visibility,rehearsal_notes) VALUES(?,?,?,?,?)').run(301,101,'Recovered set','private','Synthetic service cue');
    db.prepare('INSERT INTO setlist_songs(id,setlist_id,song_id,position,transpose,performance_key,song_notes,chart_verified) VALUES(?,?,?,?,?,?,?,?)').run(401,301,201,1,2,'E','Synthetic entry cue',1);
    db.close();
  `,
      ],
      { cwd: root, env: { ...process.env, DB_PATH: source, NODE_ENV: 'test' }, encoding: 'utf8' },
    );
    assert.equal(seed.status, 0, 'Synthetic fixture creation must succeed');
    assert.equal((await backupDatabase({ source, destination: backup })).integrity, 'ok');
    assert.equal((await verifyBackup({ backup, scratch: recovered })).integrity, 'ok');
    const server = await startServer({ database: recovered });
    try {
      const owner = jwt.sign({ id: 101 }, server.secret, { expiresIn: '5m' });
      const reader = jwt.sign({ id: 102 }, server.secret, { expiresIn: '5m' });
      const get = (url, token) => fetch(server.base + url, { headers: { Authorization: `Bearer ${token}` } });
      const song = await get('/api/songs/201', owner);
      assert.equal(song.status, 200);
      const chart = await song.json();
      assert.equal(chart.id, 201);
      assert.equal(chart.visibility, 'private');
      assert.equal(chart.content, '{key: D}\n[D]Synthetic words');
      const list = await get('/api/setlists/301', owner);
      assert.equal(list.status, 200);
      const set = await list.json();
      assert.equal(set.entries[0].entry_id, 401);
      assert.equal(set.entries[0].song_id, 201);
      assert.equal(set.entries[0].performance_key, 'E');
      assert.equal(set.entries[0].song_notes, 'Synthetic entry cue');
      assert.equal(set.entries[0].chart_verified, 1);
      for (const resource of ['/api/songs/201', '/api/setlists/301']) {
        const denied = await get(resource, reader);
        assert.ok([403, 404].includes(denied.status));
        assert.ok(!(await denied.text()).includes('Synthetic words'));
      }
    } finally {
      await server.close();
    }
  },
);
