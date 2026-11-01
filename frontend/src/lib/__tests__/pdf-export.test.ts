import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { exportSongPdf, exportSetlistPdf } from '../pdf-export';
import { PdfFormatter } from 'chordsheetjs/pdf';
import { jsPDF } from 'jspdf';
import { buildPdfConfig } from '../pdf-config';
import { prepareSong } from '../chords';
import { PDFDocument } from 'pdf-lib';
import type { Setlist, SetlistEntry } from '../../types/setlist';

// vitest root is frontend/; import.meta.url is not a file: URL under Vite
const FONT = resolve(process.cwd(), 'src/assets/NotoSansTC.ttf');

// Pull the drawn text back out of the PDF. Text is written as Identity-H glyph
// ids, so it has to be mapped back through the font's ToUnicode CMap — which is
// exactly what a PDF reader does when you select and copy.
type PdfTextRun = { text: string; x: number; y: number; size: number; page: number };
function drawnText(bytes: Uint8Array): PdfTextRun[] {
  const buf = Buffer.from(bytes);
  const raw = buf.toString('latin1');
  const streams: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      streams.push(inflateSync(buf.subarray(start, end)).toString('latin1'));
    } catch {
      /* not a deflate stream */
    }
  }
  const map: Record<string, string> = {};
  for (const s of streams) {
    for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const p of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))
        map[p[1].toLowerCase()] = String.fromCodePoint(parseInt(p[2], 16));
    for (const block of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const p of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        const [from, to, uni] = [parseInt(p[1], 16), parseInt(p[2], 16), parseInt(p[3], 16)];
        for (let i = from; i <= to; i++) map[i.toString(16).padStart(4, '0')] = String.fromCodePoint(uni + i - from);
      }
  }
  return streams
    .filter((stream) => /\bBT\b/.test(stream))
    .flatMap((stream, page) =>
      [...stream.matchAll(/BT\s+([\s\S]*?)\s+ET/g)].flatMap((block) => {
        const position = /(-?[\d.]+)\s+(-?[\d.]+)\s+Td/.exec(block[1]);
        const size = /\/F\d+\s+([\d.]+)\s+Tf/.exec(block[1]);
        const text = /<([0-9a-fA-F]+)>\s*Tj/.exec(block[1]);
        if (!position || !size || !text) return [];
        return [
          {
            text: (text[1].match(/..../g) ?? []).map((g) => map[g.toLowerCase()] ?? '').join(''),
            x: Number(position[1]),
            y: Number(position[2]),
            size: Number(size[1]),
            page,
          },
        ];
      }),
    );
}

function textOf(bytes: Uint8Array): string {
  return drawnText(bytes)
    .map((run) => run.text)
    .join('');
}

let capturedBlob: Blob;
const lastPdf = async () => new Uint8Array(await capturedBlob.arrayBuffer());

beforeAll(() => {
  const font = readFileSync(FONT);
  vi.stubGlobal('fetch', async () => new Response(font));
  // jsdom has no object URLs and won't follow a download, so intercept the blob.
  // Patch the statics only — replacing the whole URL global breaks `new URL()`.
  URL.createObjectURL = (blob: Blob) => {
    capturedBlob = blob;
    return 'blob:test';
  };
  URL.revokeObjectURL = () => {};
  // jsdom logs "navigation to another Document" for every download click
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

const song = (content: string, title = 'T') => ({ title, artist: 'A', content, bpm: null });
const opts = { transpose: 0, nashville: false, fontSize: 0 };

// Exact chart emitted by the real Always On Time PDF importer. Keep this
// pagination regression independent of Python; the opt-in import-fidelity test
// separately exercises the source PDF -> importer -> exporter path.
const alwaysOnTime = `{title: Always On Time}
{artist: Steven Furtick, Jonathan Smith, Leeland Mooring, Pat Barrett}
{key: F}
{tempo: 68}
{x_language: en}

INTRO
|[F] / / / | [C/E] / / / | [Dm] / / / | [Bb] / / / |
VERSE 1
I [F]remember how You [C/F]provided
How You [Dm/F]held me through the [Bb/F]night
I [F]remember how You [C/F]sustained me
When You [Dm/F]stepped in to save my [Bb/F]life
PRE-CHORUS
If I knew [C]then [F/A]what I know [Bb]now
I would be [C/E]still, and [F/A]let You work it [Bb]out
CHORUS
[F]Jesus, I was tossed in the [Cm]water
But I never went [Bb]under
You were [Gm]always on time
[F]Jesus, when I went through the [Cm]fire
You were right there [Bb]beside me
You were [Gm]always on time
TAG
You [F]are always, always
[Cm]Always on time
You [F/A]are always, always
[Gm]Always on time
VERSE 2
I [F]remember how You [C]carried
When I [Dm]couldn't take a [Bb]step
I [F]remember how You [C]loved me
When [Dm]I couldn't love [Bb]myself
REPEAT CHORUS
REPEAT TAG 2X
INSTRUMENTAL 1
|[F] / / / | [Eb] / / / | [Bb] / / [F/A] | [Gm] / / / |
BRIDGE (4X)
There's never been a [F]day, never been a minute
Never been a [Eb]moment that You weren't in it
There's never been a [Bb]time
That You didn't see me [Bb]through, God
So [Gm]I worship You
REPEAT CHORUS 2X
REPEAT TAG 2X
REPEAT BRIDGE
INSTRUMENTAL 2
|[F] / / / | [Eb] / / / | [Bb] / / [F/A] | [Gm] / / / |
|[F] / / / | [Eb/G] / / / | [Bb] / / [F/A] | [Gm] / / / | [Gm] / / / |
REPEAT CHORUS`;

const locationOf = (run: PdfTextRun) => `${run.page}:${run.x < 300 ? 'left' : 'right'}`;

function sectionRuns(runs: PdfTextRun[], start: string, end: string): PdfTextRun[] {
  const first = runs.findIndex((run) => run.text === start);
  const last = runs.findIndex((run, index) => index > first && run.text === end);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(last).toBeGreaterThan(first);
  // Repeated page headers can occur between two section bodies in drawing
  // order. Exclude their title/key sizes from this body-coordinate assertion.
  return runs.slice(first, last).filter((run) => run.size <= 10);
}

describe('PDF section pagination (drawn PDF coordinates)', () => {
  it('keeps Always On Time Verse 2 entirely in the right column at the requested size', async () => {
    // Prove this chart really exercises the upstream 2+2 split, rather than
    // merely asserting coordinates for a verse that would already fit.
    const stock = new PdfFormatter(buildPdfConfig({ fontName: null, fontSize: 0 }));
    stock.format(prepareSong(alwaysOnTime, 0, false)! as unknown as Parameters<PdfFormatter['format']>[0], jsPDF);
    const stockRuns = drawnText(new Uint8Array(stock.getDocumentWrapper().doc.output('arraybuffer')));
    expect(new Set(sectionRuns(stockRuns, 'VERSE 2', 'REPEAT CHORUS').map(locationOf)).size).toBe(2);

    await exportSongPdf(song(alwaysOnTime), opts);
    const bytes = await lastPdf();
    const runs = drawnText(bytes);
    const verse = sectionRuns(runs, 'VERSE 2', 'REPEAT CHORUS');
    expect(verse.map((run) => run.text).join('')).toContain("couldn't love");
    expect(verse.map((run) => run.text).join('')).toContain('myself');
    expect(new Set(verse.map(locationOf))).toEqual(new Set(['0:right']));
    // Not a blanket one-column workaround, and no silent fit-to-page shrink.
    expect(runs.some((run) => run.text === 'VERSE 1' && run.x < 300)).toBe(true);
    expect(verse.every((run) => run.size === 9 || run.size === 10)).toBe(true);
    expect(await pageCount(bytes)).toBe(1);
  });

  it('keeps normal sections across both column and page boundaries', async () => {
    const sections = Array.from(
      { length: 14 },
      (_, i) =>
        `{start_of_verse: Block ${i}}\n` +
        Array.from({ length: 4 }, (_, j) => `[G]word${i}_${j} [C]end${i}_${j}`).join('\n') +
        '\n{end_of_verse}',
    );
    await exportSongPdf(song('{key: G}\n' + sections.join('\n\n') + '\n\n{comment: FINISH}'), opts);
    const bytes = await lastPdf();
    const runs = drawnText(bytes);
    expect(await pageCount(bytes)).toBeGreaterThan(1);
    for (let i = 0; i < 14; i++) {
      const section = sectionRuns(runs, `Block ${i}`, i === 13 ? 'FINISH' : `Block ${i + 1}`);
      expect(new Set(section.map(locationOf)).size).toBe(1);
      for (let j = 0; j < 4; j++) expect(section.map((run) => run.text).join('')).toContain(`end${i}_${j}`);
      expect(section.every((run) => run.size === 9 || run.size === 10)).toBe(true);
    }
  });

  it('flows sections taller than several columns without losing or reordering any line', async () => {
    const words = Array.from({ length: 150 }, (_, i) => `line${String(i).padStart(3, '0')}`);
    await exportSongPdf(
      song(
        '{key: G}\n{start_of_verse: LONG}\n' +
          words.map((word) => `[G]${word}`).join('\n') +
          '\n{end_of_verse}\n\n{start_of_verse: AFTER}\n[C]lastword\n{end_of_verse}',
      ),
      opts,
    );
    const bytes = await lastPdf();
    const runs = drawnText(bytes);
    expect(await pageCount(bytes)).toBeGreaterThan(2);
    expect(runs.map((run) => run.text).filter((text) => /^line\d{3}$/.test(text))).toEqual(words);
    expect(runs.filter((run) => run.text === 'G')).toHaveLength(150);
    expect(runs.find((run) => run.text === 'lastword')).toBeDefined();
    // PDF bottom-origin baselines must stay within the content rectangle.
    expect(
      runs.filter((run) => /^line\d{3}$/.test(run.text)).every((run) => run.y >= 40 && run.y <= 697 && run.size === 10),
    ).toBe(true);
    expect(new Set(runs.filter((run) => /^line/.test(run.text)).map(locationOf)).size).toBeGreaterThan(4);
  });
});

describe('exportSongPdf', () => {
  it('writes English lyrics as real text', async () => {
    await exportSongPdf(song('{key: G}\n[G]Amazing grace how [C]sweet the sound\n'), opts);
    expect(textOf(await lastPdf())).toContain('Amazing grace how');
  });

  // The release blocker: with the stock config CJK is dropped silently, with no
  // error and no tofu. If this ever fails, exported Chinese songs are missing text.
  it('writes Chinese lyrics as real text', async () => {
    await exportSongPdf(song('{key: G}\n[G]奇異恩典 何等甘[C]甜\n', '奇異恩典'), opts);
    const text = textOf(await lastPdf());
    for (const ch of '奇異恩典何等甘甜') expect(text).toContain(ch);
  });

  // Header items carry their own font settings and ignore fonts.*, so a CJK
  // title/artist vanishes unless those are patched too.
  it('keeps a CJK title and artist in the header', async () => {
    await exportSongPdf(song('{title: 奇異恩典}\n{artist: 讚美之泉}\n{key: G}\n[G]大同\n'), opts);
    const text = textOf(await lastPdf());
    expect(text).toContain('奇異恩典');
    expect(text).toContain('讚美之泉');
  });

  it('applies transpose', async () => {
    await exportSongPdf(song('{key: G}\n[G]a [C]b\n'), { ...opts, transpose: 2 });
    const text = textOf(await lastPdf());
    expect(text).toContain('A');
    expect(text).toContain('D');
  });

  // Regression: a bare (unbracketed) instrumental Intro line used to survive
  // transposition unchanged in both the on-screen HTML and the PDF, since
  // PDF export shares prepareSong with the HTML renderer (see pdf-export.ts's
  // renderOne). This proves the fix applies to the PDF path too, not just HTML.
  it('transposes a bare instrumental Intro line, not just bracketed sections', async () => {
    await exportSongPdf(
      song('{key: C}\nIntro\nC F G Am\n\nVerse 1\n[C]Amazing [F]grace how [G]sweet the [Am]sound\n'),
      { ...opts, transpose: 2 },
    );
    const text = textOf(await lastPdf());
    // The transposed Intro chords must be present...
    expect(text).toContain('D');
    expect(text).toContain('Bm');
    // ...and the original, untransposed Intro root must not have survived as
    // a standalone chord line (the word "Amazing" legitimately contains no
    // "C", so this is a safe, specific check for the literal untransposed
    // "C F G Am" line rather than the correctly-transposed chords).
    expect(text).not.toContain('C F G Am');
  });

  // Regression: pipe/slash bar-notation Intro lines (e.g. "|G / / / |Cmaj7 /
  // / / |") — a third instrumental-notation shape, distinct from both a bare
  // space-separated chord line and the bracketed compact-bar syntax — used
  // to survive untransposed in both HTML and PDF, since neither existing
  // "is this a chord line?" detector recognized a pipe-prefixed line. Proves
  // the fix (bracketBarNotationLines) applies to the PDF export path too.
  it('transposes a pipe/slash bar-notation Intro line', async () => {
    await exportSongPdf(
      song('{key: G}\nIntro\n|G / / / |Gmaj7 / / / |Cmaj7 / / / |Cmaj7 / / / |\n\nVerse 1\n[G]Amazing [Cmaj7]grace\n'),
      { ...opts, transpose: 2 },
    );
    const text = textOf(await lastPdf());
    expect(text).toContain('A');
    // PDF export's chord-suffix normalization renders "maj7" as "ma7" — a
    // pre-existing, unrelated convention (see the other exportSongPdf tests);
    // this only checks that the transposed root/quality landed correctly.
    expect(text).toContain('Dma7');
    // The original untransposed root must not have survived as literal text.
    expect(text).not.toContain('G / / /');
  });

  it('applies number notation', async () => {
    await exportSongPdf(song('{key: G}\n[G]a [C]b\n'), { ...opts, nashville: true });
    const text = textOf(await lastPdf());
    expect(text).toContain('1');
    expect(text).toContain('4');
  });

  it('enforces a 7pt font floor in the actual PDF', async () => {
    await exportSongPdf(song('{key: G}\n[G]smallword\n'), { ...opts, fontSize: -50 });
    const runs = drawnText(await lastPdf());
    expect(runs.find((run) => run.text === 'smallword')?.size).toBe(7);
    expect(runs.find((run) => run.text === 'G')?.size).toBe(7);
  });

  it('reports characters no font can draw', async () => {
    const missing = await exportSongPdf(song('{key: G}\n[G]안녕하세요\n'), opts);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('reports nothing for a plain English song', async () => {
    expect(await exportSongPdf(song('{key: G}\n[G]hello\n'), opts)).toEqual([]);
  });
});

const entry = (n: number, over: Partial<SetlistEntry> = {}): SetlistEntry => ({
  entry_id: n,
  song_id: n,
  title: `Song ${n}`,
  artist: 'A',
  content: `{title: Song ${n}}\n{key: G}\n[G]la la la\n`,
  content_override: null,
  transpose: 0,
  nashville: 0,
  font: null,
  two_col: null,
  bpm: null,
  youtube_url: null,
  language: 'en',
  ...over,
});

const setlist = (entries: SetlistEntry[]): Setlist => ({
  id: 1,
  name: 'Sunday',
  visibility: 'private',
  event_date: null,
  entries,
});

// pdf-lib writes compressed object streams, so count pages by reloading it
const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe('exportSetlistPdf', () => {
  it('merges one page per song', async () => {
    await exportSetlistPdf(setlist([entry(1), entry(2), entry(3)]), { nashville: false, fontSize: 0 });
    expect(await pageCount(await lastPdf())).toBe(3);
  });

  it('adds section divider pages without changing chart page order', async () => {
    await exportSetlistPdf(
      setlist([
        entry(1, { section_id: 10, section_name: 'WELCOME' }),
        entry(2, { section_id: 10, section_name: 'WELCOME' }),
        entry(3, { section_id: 20, section_name: 'WORSHIP' }),
      ]),
      { nashville: false, fontSize: 0 },
    );
    const bytes = await lastPdf();
    expect(await pageCount(bytes)).toBe(5);
  });
  it('skips private placeholders', async () => {
    const entries = [entry(1), entry(2, { is_private_placeholder: true }), entry(3)];
    await exportSetlistPdf(setlist(entries), { nashville: false, fontSize: 0 });
    expect(await pageCount(await lastPdf())).toBe(2);
  });

  it('rejects a setlist with nothing exportable', async () => {
    await expect(
      exportSetlistPdf(setlist([entry(1, { is_private_placeholder: true })]), {
        nashville: false,
        fontSize: 0,
      }),
    ).rejects.toThrow('No exportable songs');
  });

  it('applies per-entry transpose', async () => {
    await exportSetlistPdf(setlist([entry(1, { transpose: 2 })]), { nashville: false, fontSize: 0 });
    expect(textOf(await lastPdf())).toContain('A');
  });

  it('preserves per-entry font, Nashville and transpose overrides in merged PDFs', async () => {
    await exportSetlistPdf(
      setlist([
        entry(1, { content: '{key: G}\n[G]firstword [C]endword\n', transpose: 2, _num: 0, _font: 2, font: -2 }),
        entry(2, { content: '{key: G}\n[G]secondword [C]lastword\n' }),
      ]),
      { nashville: true, fontSize: -1 },
    );
    const runs = drawnText(await lastPdf());
    expect(runs.find((run) => run.text === 'firstword ')?.size).toBe(12);
    expect(runs.find((run) => run.text === 'secondword ')?.size).toBe(9);
    expect(runs.filter((run) => run.size === 11 && run.page === 0).map((run) => run.text)).toEqual(['A', 'D']);
    expect(runs.filter((run) => run.size === 8).map((run) => run.text)).toEqual(['1', '4']);
  });

  it('prefers content_override over the song content', async () => {
    const over = { content_override: '{title: Song 1}\n{key: C}\n[C]overridden words\n' };
    await exportSetlistPdf(setlist([entry(1, over)]), { nashville: false, fontSize: 0 });
    expect(textOf(await lastPdf())).toContain('overridden');
  });

  it('gathers undrawable characters from every entry', async () => {
    const entries = [entry(1), entry(2, { content: '{key: G}\n[G]안녕\n' })];
    const missing = await exportSetlistPdf(setlist(entries), { nashville: false, fontSize: 0 });
    expect(missing.length).toBeGreaterThan(0);
  });
});
