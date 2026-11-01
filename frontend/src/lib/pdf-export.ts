import { PdfFormatter } from 'chordsheetjs/pdf';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prepareSong, resolveEffectivePreferences } from './chords';
import { buildPdfConfig } from './pdf-config';
import { EMBEDDED_FONT } from './constants';
import { loadPdfFont, makePdfConstructor, unsupportedChars } from './pdf-fonts';
import type { Setlist } from '../types/setlist';

import { formatSectionAwarePdf } from './pdf-pagination';

function download(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadFontFor(content: string): Promise<string | null> {
  try {
    return await loadPdfFont(content);
  } catch {
    throw new Error('Could not load the font needed for this song');
  }
}

async function renderOne(
  content: string,
  transpose: number,
  nashville: boolean,
  fontSize: number,
): Promise<Uint8Array> {
  const song = prepareSong(content, transpose, nashville);
  if (!song) throw new Error('Could not parse this song');

  const fontBase64 = await loadFontFor(content);
  const Doc = makePdfConstructor(fontBase64);
  const fontName = fontBase64 ? EMBEDDED_FONT : null;

  // chordsheetjs and chordsheetjs/pdf each declare their own Song class, so the
  // types don't match across entry points even though it's one object at runtime.
  const forPdf = song as unknown as Parameters<PdfFormatter['format']>[0];

  // Preserve the requested reading size; extra pages are preferable to shrinking
  // every section merely to compensate for moving one verse to the next column.
  const formatter = new PdfFormatter(buildPdfConfig({ fontName, fontSize }));
  formatSectionAwarePdf(formatter, forPdf, Doc);
  return new Uint8Array(formatter.getDocumentWrapper().doc.output('arraybuffer'));
}

interface SongData {
  title: string;
  artist: string;
  content: string;
  bpm: number | null;
}

interface SongExportOptions {
  transpose: number;
  nashville: boolean;
  fontSize: number;
}

/** Resolves to the characters no available font can draw (empty when all is well). */
export async function exportSongPdf(song: SongData, options: SongExportOptions): Promise<string[]> {
  const bytes = await renderOne(song.content, options.transpose, options.nashville, options.fontSize);
  const name = [song.title, song.artist].filter(Boolean).join(' - ') || 'song';
  download(bytes, `${name}.pdf`);
  return unsupportedChars(song.content);
}

export async function exportSetlistPdf(
  setlist: Setlist,
  globalSettings: { nashville: boolean; fontSize: number },
): Promise<string[]> {
  const entries = setlist.entries.filter((e) => !e.is_private_placeholder);
  if (!entries.length) throw new Error('No exportable songs in this setlist');

  const missing = new Set<string>();
  const parts: Uint8Array[] = [];

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex];
    const configuredSection =
      entry.section_id == null ? null : (setlist.sections || []).find((candidate) => candidate.id === entry.section_id);
    const sectionName = configuredSection?.name || entry.section_name || null;
    if (
      sectionName &&
      (entryIndex === 0 ||
        entries[entryIndex - 1]?.section_id !== entry.section_id ||
        entries[entryIndex - 1]?.section_name !== entry.section_name)
    ) {
      const sectionDoc = await PDFDocument.create();
      const page = sectionDoc.addPage();
      const font = await sectionDoc.embedFont(StandardFonts.HelveticaBold);
      const { height } = page.getSize();
      page.drawText(sectionName, { x: 48, y: height / 2, size: 28, font, color: rgb(0.12, 0.12, 0.12) });
      parts.push(await sectionDoc.save());
    }
    const prefs = resolveEffectivePreferences(entry, {
      nashville: !!globalSettings.nashville,
      twoCol: false,
      fontSize: globalSettings.fontSize,
      hideYt: false,
    });
    const content = entry.content_override || entry.content;
    parts.push(await renderOne(content, entry.transpose, prefs.nashville, prefs.fontSize));
    unsupportedChars(content).forEach((c) => missing.add(c));
  }

  const merged = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    (await merged.copyPages(src, src.getPageIndices())).forEach((p) => merged.addPage(p));
  }

  download(await merged.save(), `${setlist.name || 'setlist'}.pdf`);
  return [...missing];
}
