const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

for (const pages of [4, 5]) {
  test(`vision contact sheet ${pages === 4 ? 'renders all four pages' : 'rejects five pages without silent truncation'}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-contact-sheet-'));
    try {
      const source = path.join(dir, 'source.pdf');
      const output = path.join(dir, 'output.png');
      const python = process.env.WORSHIPSESSIONS_PYTHON || 'python';
      const fixture = spawnSync(
        python,
        [
          '-c',
          'import pymupdf,sys; d=pymupdf.open(); [(lambda p,i: p.insert_text((20,40), "Page "+str(i+1)))(d.new_page(width=200,height=100),i) for i in range(int(sys.argv[2]))]; d.save(sys.argv[1])',
          source,
          String(pages),
        ],
        { encoding: 'utf8' },
      );
      assert.equal(fixture.status, 0, fixture.stderr);
      const result = spawnSync(python, [path.join(__dirname, '..', 'scripts', 'render_pdf_pages.py'), source, output], {
        encoding: 'utf8',
      });
      if (pages === 4) {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), '4');
        assert.ok(fs.statSync(output).size > 0);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /up to 4 PDF pages.*Split this PDF/);
        assert.equal(fs.existsSync(output), false);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
