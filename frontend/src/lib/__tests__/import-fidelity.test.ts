import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderChordPro } from '../chords';
import { exportSongPdf } from '../pdf-export';

// Real PDF extraction -> production renderer -> production PDF export. This is
// not a vision-provider test and must not be reported as OCR accuracy evidence.
const require = createRequire(resolve(process.cwd(), '../package.json'));
const { importWorshipTogetherPdf } = require('./lib/worshipTogetherImport');
const evidenceDir = process.env.WS_FIDELITY_OUTPUT;
// Opt in with WS_FIDELITY_OUTPUT and a Python with PyMuPDF on PATH. Keep
// the default frontend suite independent of the local PDF extraction runtime.
const output = evidenceDir || '';
const python = process.env.WORSHIPSESSIONS_PYTHON || 'python';
let captured: Blob;

beforeAll(() => {
  mkdirSync(output, { recursive: true });
  const font = readFileSync(resolve(process.cwd(), 'src/assets/NotoSansTC.ttf'));
  vi.stubGlobal('fetch', async () => new Response(font));
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    captured = blob as Blob;
    return 'blob:fidelity';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

for (const name of ['always-on-time-worship-together', 'fall-like-rain-worship-together']) {
  it.skipIf(!evidenceDir)(
    `preserves ${name} through real extraction, HTML and exported PDF`,
    async () => {
      const input = resolve(process.cwd(), `../test/fixtures/${name}.pdf`);
      const chart = await importWorshipTogetherPdf(readFileSync(input), `${name}.pdf`);
      const html = renderChordPro(chart.content);
      const host = document.createElement('div');
      host.innerHTML = html;
      const sourceChords = [...chart.content.matchAll(/\[([A-G][^\]]*)\]/g)].map((match) => match[1]);
      const screenChords = [...host.querySelectorAll('.chord')].map((node) => node.textContent?.trim()).filter(Boolean);
      expect(sourceChords.length).toBeGreaterThan(20);
      expect(screenChords).toEqual(sourceChords);
      const barRows = chart.content.split('\n').filter((line: string) => line.includes('|'));
      const instrumentalText = [...host.querySelectorAll('.row-instrumental')]
        .map((node) => node.textContent)
        .join('\n');
      expect((instrumentalText.match(/\|/g) || []).length).toBe(barRows.join('').match(/\|/g)?.length || 0);
      expect(host.querySelectorAll('.section-row').length).toBeGreaterThan(5);

      await exportSongPdf(
        { title: chart.title, artist: chart.artist || '', content: chart.content, bpm: null },
        {
          transpose: 0,
          nashville: false,
          fontSize: 0,
        },
      );
      const pdf = join(output, `${name}-export.pdf`);
      writeFileSync(pdf, new Uint8Array(await captured.arrayBuffer()));
      const extracted = JSON.parse(
        execFileSync(
          python,
          [
            '-c',
            'import pymupdf,json,sys; d=pymupdf.open(sys.argv[1]); spans=[s for p in d for b in p.get_text("dict")["blocks"] for l in b.get("lines",[]) for s in l["spans"]]; print(json.dumps({"pages":len(d),"text":"\\n".join(p.get_text(sort=True) for p in d),"chords":[s["text"] for s in spans if "Bol" in s["font"] and s["size"]<20],"body":"".join(s["text"] for s in spans if "Reg" in s["font"] and round(s["size"])==10)}))',
            pdf,
          ],
          { encoding: 'utf8' },
        ),
      );
      expect(extracted.pages).toBeGreaterThan(0);
      expect(extracted.text).toContain(chart.title);
      expect(extracted.chords.map((chord: string) => chord.trim()).filter(Boolean)).toEqual(sourceChords);
      // Both fixtures fit at the requested default font size (9pt bold chords,
      // 10pt regular body). Compare the complete body, including repeat markers
      // and instrumental punctuation, not just a few phrases. Artist is also 10pt.
      const expectedBody = (chart.artist || '') + chart.content.replace(/\{[^}]*\}/g, '').replace(/\[[^\]]*\]/g, '');
      expect(extracted.body.replace(/\s+/g, '')).toBe(expectedBody.replace(/\s+/g, ''));
      const flatPdf = extracted.text.replace(/\s+/g, '');
      const keyPhrases = name.startsWith('always')
        ? ['I remember how You provided', "There's never been a day", 'INSTRUMENTAL 2']
        : ['God, I live to worship You', 'Fall like rain'];
      for (const phrase of keyPhrases) expect(flatPdf).toContain(phrase.replace(/\s+/g, ''));
      expect((extracted.text.match(/\|/g) || []).length).toBe((chart.content.match(/\|/g) || []).length);
      writeFileSync(join(output, `${name}-extracted.cho`), chart.content);
      writeFileSync(join(output, `${name}-pdf-text.json`), JSON.stringify(extracted, null, 2));
      const css = readFileSync(resolve(process.cwd(), 'src/styles/chord-sheet.css'), 'utf8');
      writeFileSync(
        join(output, `${name}-screen.html`),
        `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Import fidelity evidence</title><style>body{margin:0;font-family:Arial;background:#191b1d;color:#f1eee7;--surface:#202326;--border:#444;--text:#f1eee7;--text-muted:#aaa;--accent:#f5c86b}h1,p{margin:16px;font-size:16px}.chord-sheet-wrap{box-sizing:border-box;width:100%}${css}</style></head><body><h1>${chart.title}</h1><p>Production renderer and chart CSS — local fixture evidence, not a saved library song.</p><main class="chord-sheet-wrap"><div class="chord-output">${html}</div></main></body></html>`,
      );
    },
    60000,
  );
}
