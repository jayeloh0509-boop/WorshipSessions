#!/usr/bin/env node
// Run inside the built image with only fixtures and this file mounted read-only.
// Never loads server.js, application DB modules, credentials or provider clients.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function smoke() {
  const root = process.env.PDF_SMOKE_APP_ROOT || '/app';
  const fixtures = process.env.PDF_SMOKE_FIXTURES || '/fixtures';
  const python = process.env.WORSHIPSESSIONS_PYTHON || 'python';
  const { importPdfBuffer } = require(path.join(root, 'lib/pdfImport'));
  const { importWorshipTogetherPdf } = require(path.join(root, 'lib/worshipTogetherImport'));
  const results = [];
  function command(executable, args) {
    const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  }
  results.push(`Python/PyMuPDF ${command(python, ['-c', 'import pymupdf; print(pymupdf.VersionBind)'])}`);
  command('pdftotext', ['-v']);
  // Exercise the native dependency without opening any on-disk database.
  const Database = require(path.join(root, 'node_modules/better-sqlite3'));
  const db = new Database(':memory:');
  assert.equal(db.prepare('SELECT 1 AS ok').get().ok, 1);
  db.close();
  results.push('Native SQLite ABI (in memory only)');
  const clean = await importPdfBuffer(fs.readFileSync(path.join(fixtures, 'worship-together-text.pdf')), 'clean.pdf');
  assert.equal(clean.title, 'Living Hope');
  assert.equal(clean.key, 'G');
  // Poppler versions quantize columns differently; preserve lyrics exactly
  // rather than asserting the host Windows build's character offsets.
  const cleanLine = clean.content.split('\n').find((line) => line.startsWith('[G]How great'));
  assert.ok(cleanLine.includes('[C]'));
  assert.equal(cleanLine.replace(/\[[^\]]+\]/g, ''), 'How great the chasm that lay between us');
  results.push('Clean generic PDF extraction and chord placement');
  for (const [name, title, key, lyric] of [
    ['fall-like-rain-worship-together.pdf', 'Fall Like Rain', 'Eb', '[Cm7]Simple melodies of [Ab2]sacrifice'],
    ['always-on-time-worship-together.pdf', 'Always On Time', 'F', 'I [F]remember how You [C/F]provided'],
  ]) {
    const buffer = fs.readFileSync(path.join(fixtures, name));
    const result = await importWorshipTogetherPdf(buffer, name);
    assert.equal(result.title, title);
    assert.equal(result.key, key);
    assert.ok(result.content.includes(lyric), title);
    if (title === 'Always On Time') {
      assert.ok(result.content.indexOf('VERSE 1') < result.content.indexOf('BRIDGE (4X)'));
      assert.ok(result.content.includes('INTRO\n|[F] / / / | [C/E] / / / | [Dm] / / / | [Bb] / / / |'));
    }
    await assert.rejects(importPdfBuffer(buffer, name), /Ambiguous multi-column PDF layout/);
    results.push(`${title}: publisher import succeeds; generic columns reject`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-container-pdf-'));
  try {
    command(python, [
      '-c',
      String.raw`
import pathlib, sys, pymupdf
root = pathlib.Path(sys.argv[1])
d = pymupdf.open()
p = d.new_page()
for x, label in [(40, 'Left'), (340, 'Right')]:
    for y, text in [(140, 'Verse 1'), (160, 'C       G'), (176, label+' melody rises'), (196, 'Am      F'), (212, label+' voices follow')]:
        p.insert_text((x,y), text, fontsize=10, fontname='cour')
d.save(root / 'columns.pdf')
for count in [4, 5]:
    d = pymupdf.open()
    for i in range(count):
        p = d.new_page(width=200, height=100)
        p.insert_text((20,40), 'Page '+str(i+1))
    d.save(root / (str(count)+'.pdf'))
`,
      dir,
    ]);
    await assert.rejects(
      importPdfBuffer(fs.readFileSync(path.join(dir, 'columns.pdf')), 'columns.pdf'),
      /Ambiguous multi-column PDF layout/,
    );
    results.push('Generated generic parallel columns reject');
    const renderer = path.join(root, 'scripts/render_pdf_pages.py');
    const output = path.join(dir, 'four.png');
    assert.equal(command(python, [renderer, path.join(dir, '4.pdf'), output]), '4');
    assert.ok(fs.statSync(output).size > 0);
    const dimensions = JSON.parse(
      command(python, [
        '-c',
        'import pymupdf,sys,json; p=pymupdf.Pixmap(sys.argv[1]); print(json.dumps([p.width,p.height]))',
        output,
      ]),
    );
    assert.equal(dimensions[0], 250);
    assert.ok(dimensions[1] > 500, 'contact sheet includes all four page heights');
    results.push('Four-page contact sheet renders all pages');
    const rejectedOutput = path.join(dir, 'five.png');
    const rejected = spawnSync(python, [renderer, path.join(dir, '5.pdf'), rejectedOutput], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /up to 4 PDF pages.*Split this PDF/);
    assert.equal(fs.existsSync(rejectedOutput), false);
    results.push('Five-page guard rejects without partial output');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return results;
}

if (require.main === module) {
  smoke()
    .then((checks) => console.log(JSON.stringify({ ok: true, checks }, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
module.exports = { smoke };
