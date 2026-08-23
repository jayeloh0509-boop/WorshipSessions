import { buildPdfConfig } from '../pdf-config';
import { EMBEDDED_FONT } from '../constants';

const SECTIONS = ['title', 'subtitle', 'metadata', 'text', 'chord', 'comment', 'annotation', 'sectionLabel'] as const;

type StyledItem = { style?: { name?: string } };
const styledItems = (cfg: ReturnType<typeof buildPdfConfig>): StyledItem[] =>
  [...(cfg.layout?.header?.content ?? []), ...(cfg.layout?.footer?.content ?? [])].filter(
    (i): i is StyledItem => !!(i as StyledItem).style,
  );

describe('buildPdfConfig', () => {
  it('leaves the built-in font alone when no font is loaded', () => {
    const cfg = buildPdfConfig({ fontName: null, fontSize: 0 });
    expect(cfg.fonts?.text?.name).not.toBe(EMBEDDED_FONT);
  });

  it('applies the embedded font to every font section', () => {
    const cfg = buildPdfConfig({ fontName: EMBEDDED_FONT, fontSize: 0 });
    for (const s of SECTIONS) expect(cfg.fonts?.[s]?.name).toBe(EMBEDDED_FONT);
  });

  // Regression guard: patching fonts.* alone drops the CJK title and artist,
  // because header and footer items carry their own font settings.
  it('applies the embedded font to header and footer items too', () => {
    const cfg = buildPdfConfig({ fontName: EMBEDDED_FONT, fontSize: 0 });
    const styled = styledItems(cfg);
    expect(styled.length).toBeGreaterThan(0);
    for (const item of styled) expect(item.style?.name).toBe(EMBEDDED_FONT);
  });

  it('shifts font sizes by the WorshipSessions scale', () => {
    const base = buildPdfConfig({ fontName: null, fontSize: 0 });
    const big = buildPdfConfig({ fontName: null, fontSize: 2 });
    const small = buildPdfConfig({ fontName: null, fontSize: -2 });
    expect(big.fonts!.text!.size!).toBeGreaterThan(base.fonts!.text!.size!);
    expect(small.fonts!.text!.size!).toBeLessThan(base.fonts!.text!.size!);
  });

  it('never shrinks a font below a legible floor', () => {
    const cfg = buildPdfConfig({ fontName: null, fontSize: -50 });
    for (const s of SECTIONS) expect(cfg.fonts![s]!.size!).toBeGreaterThanOrEqual(5);
  });

  it('drops the stock publishing footer', () => {
    const cfg = buildPdfConfig({ fontName: null, fontSize: 0 });
    expect(JSON.stringify(cfg.layout?.footer ?? {})).not.toContain('My Music Publishing');
  });

  // Absent metadata leaves the literal text behind, so "Key of G - BPM  - Time"
  // and a bare "By" show up on songs with no tempo or artist. Conditions do not
  // suppress an item, so the fixed text has to go.
  it('leaves no orphaned label when tempo, time or artist are absent', () => {
    const cfg = buildPdfConfig({ fontName: null, fontSize: 0 });
    const templates = (cfg.layout?.header?.content ?? []).map((i) => (i as { template?: string }).template ?? '');
    const joined = templates.join(' ');
    expect(joined).not.toContain('%{tempo}');
    expect(joined).not.toContain('%{time}');
    expect(templates.some((t) => t.startsWith('By '))).toBe(false);
    expect(joined).toContain('%{artist}');
  });

  it('turns chord diagrams off', () => {
    expect(buildPdfConfig({ fontName: null, fontSize: 0 }).layout?.chordDiagrams?.enabled).toBe(false);
  });
});
