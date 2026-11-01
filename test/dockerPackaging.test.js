const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const runtime = dockerfile.split('# Stage 3: Final')[1];

test('final image installs its own Python, binary PyMuPDF and Poppler', () => {
  assert.match(runtime, /python3 python3-venv poppler-utils/);
  assert.match(runtime, /--only-binary=:all: PyMuPDF==1\.26\.7/);
  assert.match(runtime, /ENV WORSHIPSESSIONS_PYTHON="\/opt\/pdf-runtime\/bin\/python"/);
  assert.match(runtime, /ENV PATH="\/opt\/pdf-runtime\/bin:\$\{PATH\}"/);
  assert.match(runtime, /COPY scripts\/extract_pdf_text\.py scripts\/render_pdf_pages\.py \.\/scripts\//);
  assert.match(runtime, /COPY scripts\/seed-data\.mjs/);
});

test('normal Docker build context admits required scripts and excludes local dependencies and env files', () => {
  const ignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/);
  for (const name of ['seed-data.mjs', 'extract_pdf_text.py', 'render_pdf_pages.py'])
    assert.ok(ignore.includes(`!scripts/${name}`));
  for (const pattern of ['scripts/*', '**/node_modules/', '**/.env', '**/.env.*']) assert.ok(ignore.includes(pattern));
});

test('native dependencies and runtime share libc; entrypoint preserves UID handoff', () => {
  const bases = [...dockerfile.matchAll(/^FROM (\S+)/gm)].map((match) => match[1]);
  assert.deepEqual(bases, Array(3).fill('node:24-bookworm-slim'));
  assert.match(runtime, /gosu/);
  const entrypoint = fs.readFileSync(path.join(root, 'entrypoint.sh'), 'utf8');
  assert.ok(entrypoint.includes('exec gosu "$DATA_UID:$DATA_GID" node server.js'));
  assert.match(entrypoint, /exec node server\.js/);
  assert.match(runtime, /HEALTHCHECK/);
  assert.match(runtime, /CMD \["sh", "entrypoint.sh"\]/);
});

test(
  'real image passes isolated offline PDF import smoke checks',
  {
    skip:
      !process.env.PDF_SMOKE_IMAGE &&
      'Set PDF_SMOKE_IMAGE to opt in; never builds/pulls/starts a deployment implicitly',
    timeout: 120000,
  },
  () => {
    const executable = process.env.DOCKER_BIN || 'docker';
    const name = `ws-pdf-smoke-${crypto.randomUUID()}`;
    const result = spawnSync(
      executable,
      [
        'run',
        '--rm',
        '--pull=never',
        '--name',
        name,
        '--network=none',
        '--read-only',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--user=1000:1000',
        '--tmpfs',
        '/tmp:rw,nosuid,nodev,size=128m',
        '--mount',
        `type=bind,source=${path.join(root, 'test/fixtures')},target=/fixtures,readonly`,
        '--mount',
        `type=bind,source=${path.join(root, 'scripts/smoke_pdf_container.js')},target=/smoke.js,readonly`,
        '--entrypoint',
        'node',
        process.env.PDF_SMOKE_IMAGE,
        '/smoke.js',
      ],
      { encoding: 'utf8', timeout: 90000 },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.checks.length, 8);
    console.log(result.stdout);
  },
);
