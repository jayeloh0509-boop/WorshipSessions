import { ALL_KEYS, ALL_KEYS_MINOR, normalizeKey } from './keys';
import { parseChordSymbol as parseChordCore, type ParsedChord } from './theory';

// -- Chord parsing ---------------------------------------------------------

// Parses a chord token via the shared theory engine, then normalizes the root
// and bass to the app-canonical enharmonic spellings (Ab -> G#, A# -> Bb).
export function parseChordSymbol(token: string): ParsedChord | null {
  const p = parseChordCore(token);
  if (!p) return null;
  return {
    ...p,
    root: normalizeKey(p.root),
    ...(p.bass ? { bass: normalizeKey(p.bass) } : {}),
  };
}

export type { ParsedChord };

// Extracts chord occurrences from pasted text. Handles ChordPro [C] brackets,
// chords-over-lyrics, and plain progressions ("C  G  Am  F" or "| C | G |").
// Lyric lines are skipped by requiring most tokens on a line to parse as chords.
export function extractChords(text: string): ParsedChord[] {
  const chords: ParsedChord[] = [];
  if (!text || !text.trim()) return chords;

  const bracketed = text.match(/\[([^\]]+)\]/g) || [];
  for (const b of bracketed) {
    const parsed = parseChordSymbol(b.slice(1, -1));
    if (parsed) chords.push(parsed);
  }
  if (chords.length > 0) return chords;

  for (const line of text.split('\n')) {
    // Skip ChordPro directives and comment lines
    if (/^\s*\{.*\}\s*$/.test(line) || /^\s*#/.test(line)) continue;
    const tokens = line.split(/[\s|,]+/).filter((t) => t && t !== '-' && !/^N\.?C\.?$/i.test(t));
    if (tokens.length === 0) continue;
    const parsed = tokens.map(parseChordSymbol);
    const valid = parsed.filter((p): p is ParsedChord => p !== null);
    // Treat as a chord line only when most tokens are chords (ignores lyric lines)
    if (valid.length / tokens.length >= 0.6) chords.push(...valid);
  }
  return chords;
}

// -- Key detection ---------------------------------------------------------

export interface KeyCandidate {
  key: string; // e.g. 'G' or 'Em'
  isMinor: boolean;
  score: number;
  matched: string[]; // chord symbols that fit the key
  outside: string[]; // chord symbols that do not fit
}

export interface KeyDetectionResult {
  chords: ParsedChord[];
  candidates: KeyCandidate[]; // sorted best-first; empty if no chords found
  confidence: 'high' | 'medium' | 'low';
}

interface DegreeInfo {
  offset: number;
  quality: 'major' | 'minor' | 'dim';
  weight: number;
}

const MAJOR_DEGREES: DegreeInfo[] = [
  { offset: 0, quality: 'major', weight: 3 }, // I
  { offset: 2, quality: 'minor', weight: 1 }, // ii
  { offset: 4, quality: 'minor', weight: 0.8 }, // iii
  { offset: 5, quality: 'major', weight: 2 }, // IV
  { offset: 7, quality: 'major', weight: 2 }, // V
  { offset: 9, quality: 'minor', weight: 1.5 }, // vi
  { offset: 11, quality: 'dim', weight: 0.5 }, // vii°
];

const MINOR_DEGREES: DegreeInfo[] = [
  { offset: 0, quality: 'minor', weight: 3 }, // i
  { offset: 2, quality: 'dim', weight: 0.8 }, // ii°
  { offset: 3, quality: 'major', weight: 1.5 }, // III
  { offset: 5, quality: 'minor', weight: 2 }, // iv
  { offset: 7, quality: 'minor', weight: 1 }, // v
  { offset: 7, quality: 'major', weight: 2 }, // V (harmonic minor)
  { offset: 8, quality: 'major', weight: 1.5 }, // VI
  { offset: 10, quality: 'major', weight: 1.5 }, // VII
];

function noteIndex(note: string): number {
  return ALL_KEYS.indexOf(normalizeKey(note));
}

function scoreKey(chords: ParsedChord[], tonic: number, degrees: DegreeInfo[]): KeyCandidate {
  const isMinor = degrees === MINOR_DEGREES;
  const matched = new Set<string>();
  const outside = new Set<string>();
  let score = 0;

  for (const chord of chords) {
    const pc = noteIndex(chord.root);
    if (pc < 0) continue;
    const offset = (pc - tonic + 12) % 12;
    const options = degrees.filter((d) => d.offset === offset);
    if (options.length === 0) {
      outside.add(chord.symbol);
      continue;
    }
    const exact = options.find((d) => d.quality === chord.quality);
    if (exact) {
      score += exact.weight;
      matched.add(chord.symbol);
    } else if (chord.quality === 'sus' || chord.quality === 'other') {
      // Root fits the scale; quality is ambiguous
      score += options[0].weight * 0.6;
      matched.add(chord.symbol);
    } else {
      // Right root, wrong quality — weak evidence (could be a borrowed chord)
      score += options[0].weight * 0.2;
      outside.add(chord.symbol);
    }
  }

  // Songs tend to start and (especially) end on the tonic
  const tonicQuality = isMinor ? 'minor' : 'major';
  const isTonic = (c: ParsedChord) =>
    noteIndex(c.root) === tonic && (c.quality === tonicQuality || c.quality === 'sus' || c.quality === 'other');
  if (chords.length > 0 && isTonic(chords[0])) score += 2;
  if (chords.length > 1 && isTonic(chords[chords.length - 1])) score += 3;

  const key = isMinor ? ALL_KEYS_MINOR[tonic] : ALL_KEYS[tonic];
  return { key, isMinor, score, matched: [...matched], outside: [...outside] };
}

export function detectKey(text: string): KeyDetectionResult {
  const chords = extractChords(text);
  if (chords.length === 0) return { chords, candidates: [], confidence: 'low' };

  const candidates: KeyCandidate[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    candidates.push(scoreKey(chords, tonic, MAJOR_DEGREES));
    candidates.push(scoreKey(chords, tonic, MINOR_DEGREES));
  }
  candidates.sort((a, b) => b.score - a.score);

  const top = candidates[0];
  const second = candidates[1];
  let confidence: KeyDetectionResult['confidence'] = 'low';
  if (top.score > 0) {
    const separation = (top.score - second.score) / top.score;
    // High confidence needs a clear margin, no out-of-key chords, and a
    // resolution to the tonic — without a cadence, loops like C-Am-F-G stay
    // ambiguous between relative major and minor.
    const tonicIdx = (top.isMinor ? ALL_KEYS_MINOR : ALL_KEYS).indexOf(top.key);
    const last = chords[chords.length - 1];
    const endsOnTonic = noteIndex(last.root) === tonicIdx && last.quality === (top.isMinor ? 'minor' : 'major');
    if (separation >= 0.15 && top.outside.length === 0 && chords.length >= 3 && endsOnTonic) confidence = 'high';
    else if (separation >= 0.05) confidence = 'medium';
  }

  return { chords, candidates: candidates.slice(0, 4), confidence };
}

// -- Capo calculator -------------------------------------------------------

// Keys whose open-position chord shapes are comfortable on guitar,
// in rough order of how friendly they are to play.
export const OPEN_SHAPES_MAJOR = ['G', 'C', 'D', 'A', 'E'];
export const OPEN_SHAPES_MINOR = ['Em', 'Am', 'Dm'];

export interface CapoOption {
  capo: number; // 0-11 (0 = no capo)
  shape: string; // key of the open shapes you play, e.g. 'G'
  soundingKey: string; // key the audience hears
}

function keyIndex(key: string): { idx: number; isMinor: boolean } | null {
  const norm = normalizeKey(key.trim());
  const majorIdx = ALL_KEYS.indexOf(norm);
  if (majorIdx >= 0) return { idx: majorIdx, isMinor: false };
  const minorIdx = ALL_KEYS_MINOR.indexOf(norm);
  if (minorIdx >= 0) return { idx: minorIdx, isMinor: true };
  return null;
}

// Capo fret needed to sound `targetKey` while playing open shapes in `shapeKey`.
// Returns null for invalid keys or a major/minor mismatch.
export function capoForShape(targetKey: string, shapeKey: string): CapoOption | null {
  const target = keyIndex(targetKey);
  const shape = keyIndex(shapeKey);
  if (!target || !shape || target.isMinor !== shape.isMinor) return null;
  const capo = (target.idx - shape.idx + 12) % 12;
  const keys = target.isMinor ? ALL_KEYS_MINOR : ALL_KEYS;
  return { capo, shape: keys[shape.idx], soundingKey: keys[target.idx] };
}

// All practical open-shape options for a target sounding key,
// sorted by capo position (lowest first), then by shape friendliness.
export function capoOptions(targetKey: string): CapoOption[] {
  const target = keyIndex(targetKey);
  if (!target) return [];
  const shapes = target.isMinor ? OPEN_SHAPES_MINOR : OPEN_SHAPES_MAJOR;
  const options = shapes.map((s) => capoForShape(targetKey, s)).filter((o): o is CapoOption => o !== null);
  options.sort((a, b) => a.capo - b.capo || shapes.indexOf(a.shape) - shapes.indexOf(b.shape));
  return options;
}

export interface CapoPracticality {
  tier: 'none' | 'easy' | 'workable' | 'high';
  label: string;
  note: string;
}

// Practicality of a capo position on a standard acoustic guitar.
export function capoPracticality(fret: number): CapoPracticality {
  if (fret === 0) {
    return { tier: 'none', label: 'No capo', note: 'Play the sounding key directly with open shapes.' };
  }
  if (fret <= 4) {
    return { tier: 'easy', label: 'Easy', note: 'Comfortable reach with full-sounding open chords.' };
  }
  if (fret <= 7) {
    return { tier: 'workable', label: 'Workable', note: 'Still practical; the tone gets brighter and tighter.' };
  }
  return {
    tier: 'high',
    label: 'High & cramped',
    note: 'Frets are narrow up here — fine for accents, hard for full strumming.',
  };
}
