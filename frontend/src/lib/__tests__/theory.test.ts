import { describe, it, expect } from 'vitest';
import {
  noteToPc,
  pcToName,
  parseKeyName,
  semitonesBetween,
  preferredAccidentalForKey,
  scaleNotes,
  parseChordSymbol,
  transposeChord,
  transposeChart,
  transformChart,
  chordToNashville,
  nashvilleToChord,
  chartToNashville,
  nashvilleChartToChords,
  diatonicTriads,
  chordDegree,
  relativeKey,
  renderProgression,
  WORSHIP_PROGRESSIONS_MAJOR,
} from '../theory';

describe('pitch classes', () => {
  it('maps notes to pitch classes with accidentals', () => {
    expect(noteToPc('C')).toBe(0);
    expect(noteToPc('C#')).toBe(1);
    expect(noteToPc('Db')).toBe(1);
    expect(noteToPc('B')).toBe(11);
    expect(noteToPc('Cb')).toBe(11);
    expect(noteToPc('E#')).toBe(5);
  });

  it('rejects invalid notes', () => {
    expect(noteToPc('H')).toBeNull();
    expect(noteToPc('')).toBeNull();
    expect(noteToPc('c')).toBeNull();
  });

  it('names pitch classes by accidental preference and wraps negatives', () => {
    expect(pcToName(1)).toBe('C#');
    expect(pcToName(1, 'flat')).toBe('Db');
    expect(pcToName(13)).toBe('C#');
    expect(pcToName(-1)).toBe('B');
  });
});

describe('parseKeyName / semitonesBetween', () => {
  it('parses major and minor keys', () => {
    expect(parseKeyName('G')).toMatchObject({ tonicPc: 7, minor: false, name: 'G' });
    expect(parseKeyName('Em')).toMatchObject({ tonicPc: 4, minor: true, name: 'Em' });
    expect(parseKeyName('Bb')).toMatchObject({ tonicPc: 10, minor: false, name: 'Bb' });
    expect(parseKeyName('Abm')).toMatchObject({ tonicPc: 8, minor: true, name: 'G#m' });
  });

  it('rejects invalid keys', () => {
    expect(parseKeyName('H')).toBeNull();
    expect(parseKeyName('')).toBeNull();
    expect(parseKeyName('G7')).toBeNull();
  });

  it('computes normalized semitone distances', () => {
    expect(semitonesBetween('G', 'A')).toBe(2);
    expect(semitonesBetween('C', 'A')).toBe(-3);
    expect(semitonesBetween('Em', 'Gm')).toBe(3);
    expect(semitonesBetween('C', 'F#')).toBe(6);
    expect(semitonesBetween('X', 'G')).toBeNull();
  });
});

describe('scales and spelling', () => {
  it('prefers flats for flat keys and sharps for sharp keys', () => {
    expect(preferredAccidentalForKey(parseKeyName('F')!)).toBe('flat');
    expect(preferredAccidentalForKey(parseKeyName('Bb')!)).toBe('flat');
    expect(preferredAccidentalForKey(parseKeyName('G')!)).toBe('sharp');
    expect(preferredAccidentalForKey(parseKeyName('A')!)).toBe('sharp');
    expect(preferredAccidentalForKey(parseKeyName('Dm')!)).toBe('flat');
    expect(preferredAccidentalForKey(parseKeyName('Em')!)).toBe('sharp');
  });

  it('spells major scales letter-accurately', () => {
    expect(scaleNotes(parseKeyName('C')!)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(scaleNotes(parseKeyName('G')!)).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
    expect(scaleNotes(parseKeyName('F')!)).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
    expect(scaleNotes(parseKeyName('Eb')!)).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);
  });

  it('spells natural and harmonic minor scales', () => {
    expect(scaleNotes(parseKeyName('Am')!)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(scaleNotes(parseKeyName('Em')!)).toEqual(['E', 'F#', 'G', 'A', 'B', 'C', 'D']);
    expect(scaleNotes(parseKeyName('Dm')!, 'harmonic')).toEqual(['D', 'E', 'F', 'G', 'A', 'Bb', 'C#']);
  });

  it('falls back to enharmonic names when a scale would need double accidentals', () => {
    // G# major properly needs F## — the display falls back to flat spellings
    expect(scaleNotes(parseKeyName('G#')!)).toEqual(['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G']);
  });
});

describe('parseChordSymbol (theory)', () => {
  it('keeps the suffix and slash bass', () => {
    expect(parseChordSymbol('Em7')).toMatchObject({ root: 'E', suffix: 'm7', quality: 'minor' });
    expect(parseChordSymbol('D/F#')).toMatchObject({ root: 'D', bass: 'F#', suffix: '' });
    expect(parseChordSymbol('Gsus4')).toMatchObject({ quality: 'sus', suffix: 'sus4' });
  });

  it('rejects lyric words', () => {
    expect(parseChordSymbol('Amen')).toBeNull();
    expect(parseChordSymbol('Chorus')).toBeNull();
  });
});

describe('transposeChord', () => {
  it('transposes roots while preserving suffixes', () => {
    expect(transposeChord('G', 2)).toBe('A');
    expect(transposeChord('F#m7', 1)).toBe('Gm7');
    expect(transposeChord('Cmaj7', -1)).toBe('Bmaj7');
  });

  it('transposes slash basses and honors accidental preference', () => {
    expect(transposeChord('D/F#', 2)).toBe('E/G#');
    expect(transposeChord('D/F#', 2, 'flat')).toBe('E/Ab');
    expect(transposeChord('Bb', 2, 'flat')).toBe('C');
    expect(transposeChord('A', 1, 'flat')).toBe('Bb');
  });

  it('returns non-chords unchanged', () => {
    expect(transposeChord('Amen', 2)).toBe('Amen');
  });
});

describe('transposeChart', () => {
  it('transposes bracketed ChordPro chords and leaves lyrics alone', () => {
    const input = '[G]Amazing [D/F#]grace how [Em7]sweet the [C]sound';
    expect(transposeChart(input, 2)).toBe('[A]Amazing [E/G#]grace how [F#m7]sweet the [D]sound');
  });

  it('transposes the {key:} directive and preserves other directives', () => {
    const input = '{title: Amazing Grace}\n{key: G}\n[G]Amazing [C]grace';
    const out = transposeChart(input, 2);
    expect(out).toContain('{title: Amazing Grace}');
    expect(out).toContain('{key: A}');
    expect(out).toContain('[A]Amazing [D]grace');
  });

  it('transposes chord lines but not lyric lines in chords-over-lyrics text', () => {
    const input = 'G        D/F#     Em7\nAmazing grace how sweet the sound';
    const out = transposeChart(input, 2);
    expect(out.split('\n')[0]).toContain('A');
    expect(out.split('\n')[0]).toContain('E/G#');
    expect(out.split('\n')[1]).toBe('Amazing grace how sweet the sound');
  });

  it('keeps section labels, comments, bars and N.C. untouched', () => {
    const input = '[Chorus]\n# a comment\n| G | N.C. | C |';
    const out = transposeChart(input, 2);
    expect(out).toContain('[Chorus]');
    expect(out).toContain('# a comment');
    expect(out).toContain('| A | N.C. | D |');
  });

  it('preserves whitespace layout on chord lines', () => {
    expect(transposeChart('G    C', 2)).toBe('A    D');
  });

  it('uses flat spellings when asked', () => {
    expect(transposeChart('G  C  D', 3, 'flat')).toBe('Bb  Eb  F');
  });

  it('leaves a mostly-lyric line alone even when a word looks like a chord', () => {
    const line = 'A love that never fails';
    expect(transposeChart(line, 2)).toBe(line);
  });
});

describe('Nashville conversion', () => {
  const g = parseKeyName('G')!;
  const am = parseKeyName('Am')!;

  it('converts chords to numbers with suffixes and slash basses', () => {
    expect(chordToNashville('G', g)).toBe('1');
    expect(chordToNashville('Em7', g)).toBe('6m7');
    expect(chordToNashville('D/F#', g)).toBe('5/7');
    expect(chordToNashville('Csus2', g)).toBe('4sus2');
  });

  it('marks borrowed chords with accidentals', () => {
    expect(chordToNashville('Bb', g)).toBe('b3');
    expect(chordToNashville('F', g)).toBe('b7');
  });

  it('numbers minor keys against the tonic major scale', () => {
    expect(chordToNashville('Am', am)).toBe('1m');
    expect(chordToNashville('C', am)).toBe('b3');
    expect(chordToNashville('F', am)).toBe('b6');
    expect(chordToNashville('E', am)).toBe('5');
  });

  it('converts numbers back to chords', () => {
    expect(nashvilleToChord('1', g)).toBe('G');
    expect(nashvilleToChord('6m7', g)).toBe('Em7');
    expect(nashvilleToChord('5/7', g)).toBe('D/F#');
    expect(nashvilleToChord('b7', g)).toBe('F');
    expect(nashvilleToChord('4', parseKeyName('F')!, 'flat')).toBe('Bb');
  });

  it('rejects tokens that are not Nashville numbers', () => {
    expect(nashvilleToChord('8', g)).toBeNull();
    expect(nashvilleToChord('lyric', g)).toBeNull();
    expect(nashvilleToChord('', g)).toBeNull();
  });

  it('round-trips a chart through numbers and back', () => {
    const chart = '[G]Amazing [D/F#]grace how [Em7]sweet the [C]sound';
    const numbers = chartToNashville(chart, g);
    expect(numbers).toBe('[1]Amazing [5/7]grace how [6m7]sweet the [4]sound');
    expect(nashvilleChartToChords(numbers, g)).toBe(chart);
  });

  it('leaves lyric lines alone when converting numbers to chords', () => {
    const text = '1  4  5\nI will sing forever';
    const out = nashvilleChartToChords(text, g);
    expect(out.split('\n')[0]).toBe('G  C  D');
    expect(out.split('\n')[1]).toBe('I will sing forever');
  });
});

describe('diatonicTriads', () => {
  it('builds the seven major-key triads with numerals and numbers', () => {
    const triads = diatonicTriads(parseKeyName('C')!);
    expect(triads.map((t) => t.symbol)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(triads.map((t) => t.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(triads.map((t) => t.nashville)).toEqual(['1', '2m', '3m', '4', '5', '6m', '7°']);
    expect(triads[1].notes).toEqual(['D', 'F', 'A']);
  });

  it('builds natural-minor triads with lowered-degree numbers', () => {
    const triads = diatonicTriads(parseKeyName('Am')!);
    expect(triads.map((t) => t.symbol)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(triads.map((t) => t.nashville)).toEqual(['1m', '2°', 'b3', '4m', '5m', 'b6', 'b7']);
  });

  it('respects an explicit accidental preference', () => {
    const triads = diatonicTriads(parseKeyName('F')!, 'flat');
    expect(triads[3].symbol).toBe('Bb');
  });
});

describe('chordDegree', () => {
  const g = parseKeyName('G')!;
  const am = parseKeyName('Am')!;

  it('labels diatonic chords', () => {
    expect(chordDegree(parseChordSymbol('D')!, g)).toMatchObject({ roman: 'V', diatonic: true });
    expect(chordDegree(parseChordSymbol('Em7')!, g)).toMatchObject({ roman: 'vi', diatonic: true });
  });

  it('labels borrowed chords with accidental numerals', () => {
    expect(chordDegree(parseChordSymbol('Bb')!, g)).toMatchObject({ roman: 'bIII', diatonic: false });
    expect(chordDegree(parseChordSymbol('F')!, g)).toMatchObject({ roman: 'bVII', diatonic: false });
    expect(chordDegree(parseChordSymbol('E')!, g)).toMatchObject({ roman: 'VI', diatonic: false });
  });

  it('treats the harmonic-minor V and vii° as diatonic in minor keys', () => {
    expect(chordDegree(parseChordSymbol('E')!, am)).toMatchObject({ roman: 'V', diatonic: true });
    expect(chordDegree(parseChordSymbol('Em')!, am)).toMatchObject({ roman: 'v', diatonic: true });
    expect(chordDegree(parseChordSymbol('G#dim')!, am)).toMatchObject({ roman: 'vii°', diatonic: true });
  });
});

describe('relativeKey', () => {
  it('pairs each key with its relative', () => {
    expect(relativeKey(parseKeyName('G')!)).toMatchObject({ name: 'Em' });
    expect(relativeKey(parseKeyName('Em')!)).toMatchObject({ name: 'G' });
    expect(relativeKey(parseKeyName('C')!)).toMatchObject({ name: 'Am' });
    expect(relativeKey(parseKeyName('Bbm')!)).toMatchObject({ name: 'C#' });
  });
});

describe('progressions', () => {
  it('renders Nashville progressions into a key', () => {
    expect(renderProgression(['1', '5', '6m', '4'], parseKeyName('G')!)).toEqual(['G', 'D', 'Em', 'C']);
    expect(renderProgression(WORSHIP_PROGRESSIONS_MAJOR[0].tokens, parseKeyName('Bb')!)).toEqual([
      'Bb', 'F', 'Gm', 'Eb',
    ]);
  });
});

describe('transformChart plumbing', () => {
  it('only rewrites lines where most tokens map', () => {
    const out = transformChart('Great is thy faithfulness\nG  C  D', (t) =>
      parseChordSymbol(t) ? `<${t}>` : null
    );
    expect(out.split('\n')[0]).toBe('Great is thy faithfulness');
    expect(out.split('\n')[1]).toBe('<G>  <C>  <D>');
  });

  it('keeps punctuation around chord tokens', () => {
    const out = transformChart('| G | C |', (t) => (parseChordSymbol(t) ? `<${t}>` : null));
    expect(out).toBe('| <G> | <C> |');
  });
});
