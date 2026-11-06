const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBuildIdentity, readBuildIdentity, fingerprintBackend } = require('../lib/buildIdentity');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ws-build-'));
  fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public'));
  fs.writeFileSync(path.join(root, 'server.js'), 'safe server');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.22.1' }));
  fs.writeFileSync(path.join(root, 'frontend', 'src', 'app.tsx'), 'safe client');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const options = { revision: 'a'.repeat(40), sourceState: 'modified', builtAt: '2026-11-01T00:00:00.000Z' };
const shippedScripts = [
  'extract_pdf_text.py',
  'render_pdf_pages.py',
  'backup-db.js',
  'verify-db-backup.js',
  'seed-data.mjs',
];

for (const script of shippedScripts) {
  test(`shipped runtime script ${script} affects build ID and backend match`, (t) => {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const name of shippedScripts) {
      fs.writeFileSync(path.join(root, 'scripts', name), `original ${name}`);
    }
    const original = createBuildIdentity(root, options);
    const publicDir = path.join(root, 'public');
    fs.writeFileSync(path.join(publicDir, 'build-info.json'), JSON.stringify(original));
    assert.equal(readBuildIdentity(publicDir, root).backendMatchesBuild, true);
    fs.appendFileSync(path.join(root, 'scripts', script), '\nchanged runtime helper');
    const changed = createBuildIdentity(root, options);
    assert.notEqual(changed.backendFingerprint, original.backendFingerprint);
    assert.notEqual(changed.buildId, original.buildId);
    assert.equal(readBuildIdentity(publicDir, root).backendMatchesBuild, false);
  });
}

for (const field of ['buildId', 'backendFingerprint', 'frontendFingerprint']) {
  test(`manifest ${field} must be a primitive string, never a coerced array`, (t) => {
    const root = fixture(t);
    const original = createBuildIdentity(root, options);
    const publicDir = path.join(root, 'public');
    fs.writeFileSync(
      path.join(publicDir, 'build-info.json'),
      JSON.stringify({ ...original, [field]: [original[field]] }),
    );
    assert.deepEqual(readBuildIdentity(publicDir, root), {
      schemaVersion: 1,
      buildId: null,
      revision: null,
      sourceState: 'unknown',
      packageVersion: null,
      builtAt: null,
      backendMatchesBuild: null,
    });
  });
}

test('runtime fingerprint excludes development scripts and private data', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'data'));
  const original = createBuildIdentity(root, options);
  for (const name of ['scripts/dev.js', 'scripts/dev.py', 'data/private.json', '.env']) {
    fs.writeFileSync(path.join(root, name), 'not a runtime source');
  }
  assert.deepEqual(createBuildIdentity(root, options), original);
});

test('Docker frontend and final stages copy exactly the same runtime scripts', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  const frontend = dockerfile.split('# Stage 2:')[0];
  const final = dockerfile.split('# Stage 3: Final')[1];
  function copiedScripts(stage) {
    return [...stage.matchAll(/^COPY (scripts\/[^\n]+)$/gm)]
      .flatMap((match) => match[1].split(/\s+/).slice(0, -1));
  }
  const expected = shippedScripts.map((name) => `scripts/${name}`).sort();
  assert.deepEqual(copiedScripts(frontend).sort(), expected);
  assert.deepEqual(copiedScripts(final).sort(), expected);
  assert.ok(frontend.lastIndexOf('COPY scripts/') < frontend.indexOf('RUN npm run build'));
});

test('build identity is deterministic, source-sensitive and omits config/private paths', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.env'), 'JWT_SECRET=do-not-disclose');
  const first = createBuildIdentity(root, options);
  assert.deepEqual(createBuildIdentity(root, options), first);
  assert.match(first.buildId, /^ws-[a-f0-9]{24}$/);
  assert.equal(first.revision, options.revision);
  assert.equal(first.sourceState, 'modified');
  assert.equal(first.packageVersion, '1.22.1');
  assert.ok(!JSON.stringify(first).includes(root));
  assert.ok(!JSON.stringify(first).includes('do-not-disclose'));
  fs.writeFileSync(path.join(root, '.env'), 'JWT_SECRET=changed');
  assert.deepEqual(createBuildIdentity(root, options), first);
  fs.writeFileSync(path.join(root, 'frontend', 'src', 'app.tsx'), 'changed client');
  assert.notEqual(createBuildIdentity(root, options).buildId, first.buildId);
});

test('startup identity is sanitized and detects backend changes', (t) => {
  const root = fixture(t);
  const original = createBuildIdentity(root, options);
  fs.writeFileSync(
    path.join(root, 'public', 'build-info.json'),
    JSON.stringify({ ...original, password: 'never-expose', path: root }),
  );
  const current = readBuildIdentity(path.join(root, 'public'), root);
  assert.equal(current.backendMatchesBuild, true);
  assert.ok(!JSON.stringify(current).includes('never-expose'));
  assert.ok(!JSON.stringify(current).includes(root));
  fs.writeFileSync(path.join(root, 'server.js'), 'changed server');
  assert.equal(readBuildIdentity(path.join(root, 'public'), root).backendMatchesBuild, false);
  assert.notEqual(fingerprintBackend(root), original.backendFingerprint);
});

test('missing, malformed or untrusted manifests report unknown, not a fabricated release', (t) => {
  const root = fixture(t);
  const dir = path.join(root, 'public');
  assert.equal(readBuildIdentity(dir, root).buildId, null);
  fs.writeFileSync(path.join(dir, 'build-info.json'), '{broken secret text');
  assert.equal(readBuildIdentity(dir, root).buildId, null);
  fs.writeFileSync(
    path.join(dir, 'build-info.json'),
    JSON.stringify({ ...createBuildIdentity(root, options), revision: '<script>secret</script>' }),
  );
  const result = readBuildIdentity(dir, root);
  assert.equal(result.buildId, null);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
