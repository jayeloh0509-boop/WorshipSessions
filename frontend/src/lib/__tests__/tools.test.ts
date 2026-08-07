import { describe, it, expect } from 'vitest';
import {
  parseChordSymbol,
  extractChords,
  detectKey,
  capoForShape,
  capoOptions,
  capoPracticality,
} from '../tools';

describe('parseChordSymbol', () => {
  it('parses plain major and minor chords', () => {
    expect(parseChordSymbol('G')).toMatchObject({ root: 'G', quality: 'major' });
    expect(parseChordSymbol('Am')).toMatchObject({ root: 'A', quality: 'minor' });
    expect(parseChordSymbol('F#m')).toMatchObject({ root: 'F#', quality: 'minor' });
  });

  it('parses extensions and slash chords', () => {
    expect(parseChordSymbol('Em7')).toMatchObject({ root: 'E', quality: 'minor' });
    expect(parseChordSymbol('Cmaj7')).toMatchObject({ root: 'C', quality: 'major' });
    expect(parseChordSymbol('D/F#')).toMatchObject({ root: 'D', quality: 'major', bass: 'F#' });
    expect(parseChordSymbol('Gsus4')).toMatchObject({ root: 'G', quality: 'sus' });
    expect(parseChordSymbol('Bdim')).toMatchObject({ root: 'B', quality: 'dim' });
  });

  it('normalizes enharmonic roots to app spelling', () => {
    expect(parseChordSymbol('Ab')).toMatchObject({ root: 'G#' });
    expect(parseChordSymbol('A#')).toMatchObject({ root: 'Bb' });
  });

  it('rejects words that merely start with a note letter', () => {
    expect(parseChordSymbol('Amen')).toBeNull();
    expect(parseChordSymbol('Chorus')).toBeNull();
    expect(parseChordSymbol('Grace')).toBeNull();
    expect(parseChordSymbol('')).toBeNull();
  });
});

describe('extractChords', () => {
  it('extracts ChordPro bracket chords and ignores lyrics', () => {
    const text = '[G]Amazing [D]grace how [Em]sweet the [C]sound';
    expect(extractChords(text).map((c) => c.symbol)).toEqual(['G', 'D', 'Em', 'C']);
  });

  it('extracts plain progressions with separators', () => {
    expect(extractChords('| C | G | Am | F |').map((c) => c.symbol)).toEqual(['C', 'G', 'Am', 'F']);
    expect(extractChords('C, G, Am, F').map((c) => c.symbol)).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('picks chord lines out of chords-over-lyrics text and skips lyric lines', () => {
    const text = 'G        D/F#     Em7\nAmazing grace how sweet the sound';
    expect(extractChords(text).map((c) => c.symbol)).toEqual(['G', 'D/F#', 'Em7']);
  });

  it('skips directives and N.C. markers', () => {
    const text = '{key: G}\nG  N.C.  C';
    expect(extractChords(text).map((c) => c.symbol)).toEqual(['G', 'C']);
  });

  it('returns empty for empty or chord-free input', () => {
    expect(extractChords('')).toEqual([]);
    expect(extractChords('   \n  ')).toEqual([]);
    expect(extractChords('just some plain lyrics with no chords')).toEqual([]);
  });
});

describe('detectKey', () => {
  it('detects a clear major key', () => {
    const result = detectKey('G  C  D  Em  G');
    expect(result.candidates[0].key).toBe('G');
    expect(result.candidates[0].isMinor).toBe(false);
  });

  it('detects a clear minor key', () => {
    const result = detectKey('Am  Dm  E  Am');
    expect(result.candidates[0].key).toBe('Am');
    expect(result.candidates[0].isMinor).toBe(true);
  });

  it('uses first/last chord to break the relative major/minor tie', () => {
    const major = detectKey('C  Am  F  G  C');
    expect(major.candidates[0].key).toBe('C');
    const minor = detectKey('Am  F  C  G  Am');
    expect(minor.candidates[0].key).toBe('Am');
  });

  it('is not overconfident on ambiguous progressions', () => {
    const result = detectKey('C  Am  F  G');
    expect(result.confidence).not.toBe('high');
    const keys = result.candidates.slice(0, 2).map((c) => c.key);
    expect(keys).toContain('C');
  });

  it('flags chords outside the detected key', () => {
    const result = detectKey('G  C  D  Bb  G');
    expect(result.candidates[0].key).toBe('G');
    expect(result.candidates[0].outside).toContain('Bb');
  });

  it('handles slash chords and extensions', () => {
    const result = detectKey('G  D/F#  Em7  Cmaj7  G');
    expect(result.candidates[0].key).toBe('G');
  });

  it('returns no candidates and low confidence for empty or invalid input', () => {
    expect(detectKey('')).toMatchObject({ candidates: [], confidence: 'low' });
    expect(detectKey('la la la lyrics only')).toMatchObject({ candidates: [], confidence: 'low' });
  });
});

describe('capoForShape', () => {
  it('computes the capo fret for a shape below the target', () => {
    expect(capoForShape('Bb', 'G')).toMatchObject({ capo: 3, shape: 'G', soundingKey: 'Bb' });
    expect(capoForShape('E', 'C')).toMatchObject({ capo: 4, shape: 'C', soundingKey: 'E' });
  });

  it('returns capo 0 when the shape is the target key', () => {
    expect(capoForShape('G', 'G')).toMatchObject({ capo: 0 });
  });

  it('wraps around when the shape is above the target', () => {
    expect(capoForShape('C', 'D')).toMatchObject({ capo: 10 });
  });

  it('handles minor keys', () => {
    expect(capoForShape('Gm', 'Em')).toMatchObject({ capo: 3, shape: 'Em', soundingKey: 'Gm' });
  });

  it('normalizes enharmonic input consistently', () => {
    expect(capoForShape('A#', 'G')).toMatchObject({ capo: 3, soundingKey: 'Bb' });
    expect(capoForShape('Db', 'C')).toMatchObject({ capo: 1, soundingKey: 'C#' });
  });

  it('rejects invalid keys and major/minor mismatches', () => {
    expect(capoForShape('H', 'G')).toBeNull();
    expect(capoForShape('G', 'X')).toBeNull();
    expect(capoForShape('Gm', 'G')).toBeNull();
  });
});

describe('capoOptions', () => {
  it('lists options sorted by capo position', () => {
    const opts = capoOptions('Bb');
    expect(opts.length).toBeGreaterThan(0);
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i].capo).toBeGreaterThanOrEqual(opts[i - 1].capo);
    }
  });

  it('puts the no-capo option first when the target is an open key', () => {
    expect(capoOptions('G')[0]).toMatchObject({ capo: 0, shape: 'G' });
  });

  it('offers only minor shapes for minor targets', () => {
    const opts = capoOptions('Bm');
    expect(opts.every((o) => o.shape.endsWith('m'))).toBe(true);
    expect(opts[0]).toMatchObject({ capo: 2, shape: 'Am', soundingKey: 'Bm' });
  });

  it('keeps every capo within 0-11', () => {
    for (const key of ['C', 'C#', 'F#', 'B', 'Ebm']) {
      for (const o of capoOptions(key)) {
        expect(o.capo).toBeGreaterThanOrEqual(0);
        expect(o.capo).toBeLessThanOrEqual(11);
      }
    }
  });

  it('returns empty for invalid input', () => {
    expect(capoOptions('nonsense')).toEqual([]);
  });
});

describe('capoPracticality', () => {
  it('tiers frets from no-capo through high positions', () => {
    expect(capoPracticality(0).tier).toBe('none');
    expect(capoPracticality(2).tier).toBe('easy');
    expect(capoPracticality(4).tier).toBe('easy');
    expect(capoPracticality(6).tier).toBe('workable');
    expect(capoPracticality(8).tier).toBe('high');
    expect(capoPracticality(11).tier).toBe('high');
  });

  it('includes a label and rationale', () => {
    const p = capoPracticality(3);
    expect(p.label).toBeTruthy();
    expect(p.note).toBeTruthy();
  });
});
