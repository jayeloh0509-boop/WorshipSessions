const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { extractPdfText, importPdfBuffer, pdfTextToChordPro } = require('../lib/pdfImport');
const { importWorshipTogetherPdf } = require('../lib/worshipTogetherImport');

const python = process.env.WORSHIPSESSIONS_PYTHON || 'python';
const script = path.join(__dirname, '..', 'scripts', 'extract_pdf_text.py');
let directory;

// Real text PDFs, generated locally with PyMuPDF (no mocks, OCR, or network).
const generate = String.raw`
import pathlib, sys, pymupdf
root = pathlib.Path(sys.argv[1])
def row(page, x, y, text):
    page.insert_text((x, y), text, fontsize=10, fontname="cour")
def heading(page):
    row(page, 40, 40, "Layout Regression")
    row(page, 40, 60, "Artist: Local Test")
    row(page, 40, 80, "Key: C")
def column(page, x, y, label):
    row(page, x, y, "Verse 1" if label == "Left" else "Chorus")
    row(page, x, y + 20, "C       G")
    row(page, x, y + 36, label + " melody rises")
    row(page, x, y + 56, "Am      F")
    row(page, x, y + 72, label + " voices follow")
def two_columns(page, stagger=0, right=340):
    column(page, 40, 140, "Left")
    column(page, right, 140 + stagger, "Right")
for name, stagger, right in [("two-column", 0, 340), ("staggered", 7, 260)]:
    doc = pymupdf.open()
    page = doc.new_page()
    heading(page)
    two_columns(page, stagger, right)
    doc.save(root / (name + ".pdf"))
doc = pymupdf.open()
page = doc.new_page()
heading(page)
column(page, 40, 140, "Left")
doc.save(root / "one-column.pdf")
page = doc.new_page()
heading(page)
two_columns(page)
doc.save(root / "mixed-pages.pdf")
doc = pymupdf.open()
page = doc.new_page()
heading(page)
row(page, 40, 140, "Verse 1")
for y in (160, 220):
    row(page, 40, y, "Cadd9")
    row(page, 350, y, "G/B")
    row(page, 40, y + 16, "Sing a melody across this whole single column today")
doc.save(root / "wide-chords.pdf")
doc = pymupdf.open()
page = doc.new_page()
heading(page)
column(page, 40, 140, "Left")
column(page, 340, 400, "Right")
doc.save(root / "sequential-regions.pdf")
doc = pymupdf.open()
page = doc.new_page()
heading(page)
column(page, 340, 140, "Right")
row(page, 40, 700, "Footer credits")
doc.save(root / "indented-stream.pdf")
`;

function pdf(name) {
  return path.join(directory, `${name}.pdf`);
}

function extractWithPython(file, mode) {
  return spawnSync(python, [script, file, ...(mode ? [mode] : [])], { encoding: 'utf8' });
}

test.before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'generic-pdf-layout-'));
  const result = spawnSync(python, ['-c', generate, directory], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
test.after(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test('real generated two-column PDF reproduced silent row merging, now rejects before conversion', async () => {
  const raw = spawnSync('pdftotext', ['-layout', '-nopgbrk', pdf('two-column'), '-'], { encoding: 'utf8' });
  assert.equal(raw.status, 0, raw.stderr);
  assert.match(raw.stdout, /Left melody rises\s+Right melody rises/);
  // This is why detecting a bracketed chord alone is not an acceptance gate.
  assert.match(pdfTextToChordPro(raw.stdout).content, /Left.*Right/);
  await assert.rejects(extractPdfText(pdf('two-column')), /Ambiguous multi-column PDF layout on page 1/);
  await assert.rejects(
    importPdfBuffer(fs.readFileSync(pdf('two-column')), 'two-column.pdf'),
    /cannot safely determine reading order/,
  );
});

test('staggered off-centre columns are rejected even without matching lyric baselines', async () => {
  await assert.rejects(extractPdfText(pdf('staggered')), /Ambiguous multi-column PDF layout on page 1/);
});

test('a later multi-column page rejects the entire PDF, not just the unsafe page', async () => {
  await assert.rejects(
    importPdfBuffer(fs.readFileSync(pdf('mixed-pages')), 'mixed-pages.pdf'),
    /Ambiguous multi-column PDF layout on page 2/,
  );
});

test('generated one-column chord/lyric association still uses original Poppler coordinates', async () => {
  const result = await importPdfBuffer(fs.readFileSync(pdf('one-column')), 'one-column.pdf');
  assert.equal(result.title, 'Layout Regression');
  assert.equal(result.key, 'C');
  // Poppler quantizes PDF coordinates to text columns; preserve its current
  // placement rather than silently switching the one-column extraction path.
  assert.match(result.content, /^\[C\]Left melo\[G\]dy rises$/m);
  assert.match(result.content, /^\[Am\]Left voic\[F\]es follow$/m);
});

test('widely separated extended chords above a single lyric stream are not columns', async () => {
  const result = await importPdfBuffer(fs.readFileSync(pdf('wide-chords')), 'wide-chords.pdf');
  assert.match(result.content, /\[Cadd9\]Sing a melody across this whole single column today\[G\/B\]/);
});

test('sequential left/right regions without vertical overlap are not parallel streams', async () => {
  const text = await extractPdfText(pdf('sequential-regions'));
  assert.ok(text.indexOf('Left melody rises') < text.indexOf('Right melody rises'));
});

test('left header/footer around one indented lyric stream do not create a second column', async () => {
  const text = await extractPdfText(pdf('indented-stream'));
  assert.match(text, /Right melody rises/);
  assert.match(text, /Footer credits/);
});

test('Python default extraction also rejects columns; layout-json remains available for inspection', () => {
  const rejected = extractWithPython(pdf('two-column'));
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stdout, '');
  assert.match(rejected.stderr, /Ambiguous multi-column PDF layout/);
  const layout = extractWithPython(pdf('two-column'), '--layout-json');
  assert.equal(layout.status, 0, layout.stderr);
  const pages = JSON.parse(layout.stdout).pages;
  assert.equal(pages.length, 1);
  assert.ok(pages[0].words.some((word) => word[4] === 'Left'));
  assert.ok(pages[0].words.some((word) => word[4] === 'Right'));
  const safe = extractWithPython(pdf('one-column'));
  assert.equal(safe.status, 0, safe.stderr);
  assert.match(safe.stdout, /Left melody rises/);
});

test('missing layout checker fails closed rather than falling back to unchecked Poppler', () => {
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `
    require(${JSON.stringify(require.resolve('../lib/pdfImport'))}).extractPdfText(process.argv[1])
      .then(() => { process.exitCode = 1; })
      .catch(error => { console.log(error.message); });
  `,
      pdf('one-column'),
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, WORSHIPSESSIONS_PYTHON: path.join(directory, 'missing-python') },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /Generic PDF layout safety check failed: .*ENOENT/);
});

test('existing Living Hope one-column fixture still imports with its exact current chord placement', async () => {
  const result = await importPdfBuffer(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'worship-together-text.pdf')),
    'worship-together-text.pdf',
  );
  assert.equal(result.title, 'Living Hope');
  assert.equal(result.key, 'G');
  assert.match(result.content, /^\[G\]How great th\[C\]e chasm that lay between us$/m);
});

for (const [name, title, key, lyric] of [
  ['always-on-time-worship-together.pdf', 'Always On Time', 'F', 'I [F]remember how You [C/F]provided'],
  ['fall-like-rain-worship-together.pdf', 'Fall Like Rain', 'Eb', '[Cm7]Simple melodies of [Ab2]sacrifice'],
]) {
  test(`real publisher columns reject generic extraction while the WT route remains intact: ${title}`, async () => {
    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', name));
    await assert.rejects(importPdfBuffer(fixture, name), /Ambiguous multi-column PDF layout/);
    const result = await importWorshipTogetherPdf(fixture, name);
    assert.equal(result.title, title);
    assert.equal(result.key, key);
    assert.ok(result.content.includes(lyric));
    if (title === 'Always On Time') {
      assert.ok(result.content.indexOf('VERSE 1') < result.content.indexOf('BRIDGE (4X)'));
      assert.ok(result.content.includes('INTRO\n|[F] / / / | [C/E] / / / | [Dm] / / / | [Bb] / / / |'));
    }
  });
}
