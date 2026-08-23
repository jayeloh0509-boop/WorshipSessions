import { describe, it, expect } from 'vitest';
import { renderChordPro, canonicalizeSectionLabel, prepareForPersist } from '../chords';

// ─── Unified format & look: structural snapshot contract ──────────
//
// Every chart in the app (read view, editor preview, setlist playback,
// PDF export) must render through renderChordPro() and produce HTML that
// shares the same structural skeleton. The tests below assert that
// invariant at the structure level — tag names, class names, ordering,
// section-label form — without locking down chord lyrics or chord text
// (those vary song to song and would create brittle snapshots).
//
// If a future change drifts any chart away from this shape, every
// affected test in this file fails at once so the regression is loud.

interface ChartStructure {
  outer: string;
  topLevelTags: string[];
  paragraphTypes: string[];
  headings: string[];
  rowClassNames: string[];
  columnClassNames: string[];
  chordClassNames: string[];
  lyricClassNames: string[];
  inlineStyles: number;
}

function structureOf(html: string): ChartStructure {
  // Strip all `<br>` self-closing variants for stable structural inspection.
  const cleaned = html.replace(/<br\s*\/?>/g, '');
  const topLevelTags = Array.from(cleaned.matchAll(/<(div|span|p|h3|ul|li)\b/g)).map((m) => m[1]);
  const paragraphTypes = Array.from(cleaned.matchAll(/<div class="paragraph\s+([a-z0-9-]+)"/g)).map((m) => m[1]);
  const headings = Array.from(cleaned.matchAll(/<h3 class="label">([^<]*)<\/h3>/g)).map((m) => m[1]);
  const rowClassNames = Array.from(cleaned.matchAll(/<div class="(row[^"]*)"/g)).map((m) => m[1]);
  const columnClassNames = Array.from(cleaned.matchAll(/<span class="(column[^"]*)"/g)).map((m) => m[1]);
  const chordClassNames = Array.from(cleaned.matchAll(/<span class="(chord[^"]*)"/g)).map((m) => m[1]);
  const lyricClassNames = Array.from(cleaned.matchAll(/<span class="(lyrics[^"]*)"/g)).map((m) => m[1]);
  const inlineStyles = (cleaned.match(/style="/g) || []).length;
  return {
    outer: cleaned.startsWith('<div class="chord-sheet">') ? 'chord-sheet' : 'other',
    topLevelTags,
    paragraphTypes,
    headings,
    rowClassNames,
    columnClassNames,
    chordClassNames,
    lyricClassNames,
    inlineStyles,
  };
}

function assertUnifiedFormat(html: string, label: string): void {
  const s = structureOf(html);
  // 1. The outer wrapper is always the same themed surface.
  expect(s.outer, `${label}: outer wrapper must be chord-sheet`).toBe('chord-sheet');
  // 2. A parsed chart must contain at least one paragraph wrapper. The
  //    unparseable-fallback path uses .chord-sheet-fallback instead and is
  //    verified separately.
  if (!html.includes('chord-sheet-fallback')) {
    expect(s.paragraphTypes.length, `${label}: parsed chart must have at least one .paragraph wrapper`).toBeGreaterThan(
      0,
    );
  }
  // 3. Every paragraph type is a single lowercase token (or hyphenated)
  //    and comes from the parser's vocabulary — no ad-hoc class names.
  const validTypeRe = /^[a-z][a-z0-9-]*$/;
  for (const t of s.paragraphTypes) {
    expect(validTypeRe.test(t), `${label}: paragraph type "${t}" is not a valid token`).toBe(true);
  }
  // 4. Every heading matches the canonical section-label form.
  for (const h of s.headings) {
    const canon = canonicalizeSectionLabel(h);
    expect(h, `${label}: heading "${h}" must equal canonical form "${canon}"`).toBe(canon);
  }
  // 5. No inline styles — themes live in chord-sheet.css.
  expect(s.inlineStyles, `${label}: must have no inline styles`).toBe(0);
  // 6. Every row belongs to the unified `.row` family.
  for (const cls of s.rowClassNames) {
    expect(cls === 'row' || cls.startsWith('row '), `${label}: row class "${cls}" must belong to the .row family`).toBe(
      true,
    );
  }
  // 7. Every chord/lyric/column token shares its class with the parser
  //    family so they pick up the unified typography.
  for (const cls of s.columnClassNames) {
    expect(
      cls === 'column' || cls.startsWith('column '),
      `${label}: column class "${cls}" must belong to the .column family`,
    ).toBe(true);
  }
  expect(
    s.chordClassNames.every((c) => c === 'chord'),
    `${label}: chord class drift`,
  ).toBe(true);
  expect(
    s.lyricClassNames.every((c) => c === 'lyrics'),
    `${label}: lyrics class drift`,
  ).toBe(true);
}

describe('unified chord-chart format — structural contract', () => {
  it('renders every fixture in the same shape', () => {
    const fixtures = [
      '{title: T}\n{key: C}\n\n[C]hello [G]world',
      '{key: C}\n[Verse 1]\n[C]hi\n\n[Chorus]\n[G]yay',
      '{key: C}\n[VERSE1]\n[C]hi\n\n[CHORUS]\n[G]yay',
      '{key: G}\nIntro\n[Em] [C] [G] [D]\n\nVerse 1\n[G]a [C]b',
      '{key: Eb}\n[Pre-Chorus]\n[Eb]line\n[Chorus]\n[Bb]yay',
      '{title: Center}\n{key: G}\n[Intro]\n[G///|]\n[Verse 1]\n[G]in [C]you',
      '{title: BWV}\n{key: G}\n[Verse 1]\n[G]a [G/B]b [C]c [D]d',
      '[| C | G/B | Am | F |]\n[| F | G | C |]',
    ];
    for (const f of fixtures) {
      const html = renderChordPro(f, 0, false);
      assertUnifiedFormat(html, `fixture: ${f.slice(0, 40)}`);
    }
  });

  it('canonicalizes accepted annotated and repeat headings', () => {
    expect(canonicalizeSectionLabel('VERSE 1 (quiet)')).toBe('Verse 1 (quiet)');
    expect(canonicalizeSectionLabel('pre chorus (build)')).toBe('Pre-Chorus (build)');
    expect(canonicalizeSectionLabel('REPEAT CHORUS X 2')).toBe('REPEAT Chorus X 2');
  });

  it('preserves internally-piped compact bars without outer pipes during persistence', () => {
    const input = '{title: X}\nInstrumental\n[G///| A///| Bm///| F#m///]';
    expect(prepareForPersist(input)).toBe(`${input}\n`);
  });

  it('renders Nashville mode through the same skeleton', () => {
    const html = renderChordPro('{title: T}\n{key: G}\n[Verse 1]\n[G]a [C]b [D]c', 0, true);
    assertUnifiedFormat(html, 'nashville');
  });

  it('renders transposed charts through the same skeleton', () => {
    const html = renderChordPro('{title: T}\n{key: G}\n[Verse 1]\n[G]a [C]b [D]c', 2, false);
    assertUnifiedFormat(html, 'transpose +2');
  });

  it('renders the unparseable fallback through the same skeleton', () => {
    // An unterminated directive forces parse failure.
    const html = renderChordPro('{key: G\n[G]hi', 0, false);
    assertUnifiedFormat(html, 'fallback');
  });

  // The live-library structural check lives in a backend Node test
  // (test/unified-format.test.js) so it can read the SQLite database
  // directly without dragging better-sqlite3 into the frontend bundle.
});
