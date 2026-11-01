import { PdfFormatter } from 'chordsheetjs/pdf';

type PdfSong = Parameters<PdfFormatter['format']>[0];
type LayoutLine = { lineHeight: number };
type Units = LayoutLine[][];
type Split = (units: Units, y: number, top: number, bottom: number, count: number) => Units;

/**
 * ChordSheetJS 15.6 has no keep-together configuration. Its stock splitter
 * deliberately splits four-line verses 2+2 even when they fit a fresh column.
 * Adapt the splitter on this formatter's engine only; keep the library's own
 * measured/wrapped lines, break tags, renderer, fonts and text drawing intact.
 * This small private-API boundary is guarded and covered by real PDF tests.
 */
export function keepPdfSectionsTogether(formatter: PdfFormatter): void {
  type Engine = { paragraphSplitter: { splitParagraph: Split } };
  const adapter = formatter as unknown as { createLayoutEngine: () => Engine };
  if (typeof adapter.createLayoutEngine !== 'function') {
    throw new Error('Unsupported ChordSheetJS PDF layout API');
  }
  const createEngine = adapter.createLayoutEngine.bind(formatter);
  adapter.createLayoutEngine = () => {
    const engine = createEngine();
    if (typeof engine.paragraphSplitter?.splitParagraph !== 'function') {
      throw new Error('Unsupported ChordSheetJS PDF paragraph API');
    }
    const split = engine.paragraphSplitter.splitParagraph.bind(engine.paragraphSplitter);
    engine.paragraphSplitter.splitParagraph = (units, y, top, bottom) => {
      // Asking the stock <=3-line strategy for a break preserves its own Tag
      // class identity (the main and PDF bundles have separate constructors).
      const breakUnits = () => split([], top + 1, top, bottom, 0);
      const height = units.flat().reduce((sum, line) => sum + line.lineHeight, 0);
      if (height <= bottom - top) {
        return y + height <= bottom || y === top ? units : [...breakUnits(), ...units];
      }
      // A section taller than a column must be allowed to flow, without losing
      // lines or causing the engine's simulation to drift from the renderer.
      const result: Units = [];
      for (const line of units.flat()) {
        if (y + line.lineHeight > bottom && y > top) {
          result.push(...breakUnits());
          y = top;
        }
        result.push([line]);
        y += line.lineHeight;
      }
      return result;
    };
    return engine;
  };
}

export function formatSectionAwarePdf(
  formatter: PdfFormatter,
  song: PdfSong,
  constructor: Parameters<PdfFormatter['format']>[1],
): void {
  keepPdfSectionsTogether(formatter);
  formatter.format(song, constructor);
}
