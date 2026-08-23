import * as ChordSheetJS from 'chordsheetjs';

export const ALL_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
export const ALL_KEYS_MINOR = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

export const ENHARMONIC_MAP: Record<string, string> = {
  // Prefer sharps generally, but Bb and Eb are exceptions
  Db: 'C#',
  Gb: 'F#',
  Ab: 'G#',
  'A#': 'Bb',
  'D#': 'Eb',
  Cb: 'B',
  Cbm: 'Bm',
  Dbm: 'C#m',
  Gbm: 'F#m',
  Abm: 'G#m',
  'A#m': 'Bbm',
  'D#m': 'Ebm',
};

export function normalizeKey(k: string): string {
  return ENHARMONIC_MAP[k] || k;
}

// Chord-body overrides applied after a song has already been transposed with
// a consistent accidental (see preferredAccidental below). Unlike
// ENHARMONIC_MAP, these hold true no matter which accidental the rest of the
// song is using — real chord charts never write these spellings regardless
// of context:
// - A#/D# are always written Bb/Eb, the two flat names virtually every
//   musician defaults to even in an otherwise sharp-spelled chart.
// - Cb/Fb and B#/E# are the four "no black key between these two letters"
//   enharmonic pairs (Cb=B, Fb=E, B#=C, E#=F). They're legitimate diatonic
//   spellings once you force a whole song to one accidental — e.g. Cb is the
//   real IV of Gb major, and ChordSheetJS's accidental:'b'/'#' option
//   produces all four of these under the right destination key — but nobody
//   writes them on a chord chart. Cb→B was fixed for this reason in "Fix Cb
//   chord when transposing to F#" (see git history); Fb/B#/E# are the same
//   problem in the other three corners of the circle, surfaced by an
//   exhaustive semitone-by-semitone scan while fixing the flat-key
//   spelling-consistency bug.
const CHORD_SPELLING_OVERRIDES: Record<string, string> = {
  'A#': 'Bb',
  'D#': 'Eb',
  'A#m': 'Bbm',
  'D#m': 'Ebm',
  Cb: 'B',
  Cbm: 'Bm',
  Fb: 'E',
  Fbm: 'Em',
  'B#': 'C',
  'B#m': 'Cm',
  'E#': 'F',
  'E#m': 'Fm',
};

export function normalizeChord(chord: string): string {
  if (!chord) return chord;
  return chord.replace(/[A-G][b#]?m?/g, (m) => CHORD_SPELLING_OVERRIDES[m] || m);
}

// Which accidental (sharp '#' or flat 'b') the WHOLE song's chords should use
// when transposing to `key`, so a destination like "Ab" (labeled "G#" per
// ALL_KEYS) renders every chord consistently instead of letting the
// transpose engine pick sharp or flat independently per chord. Matches the
// app's existing canonical key-label preference (normalizeKey): flat only
// for the two keys ALL_KEYS itself labels with a flat (Eb, Bb), sharp for
// everything else.
export function preferredAccidental(key: string): '#' | 'b' {
  const norm = normalizeKey(key);
  return norm.startsWith('Eb') || norm.startsWith('Bb') ? 'b' : '#';
}

export function getTransposeDelta(fromKey: string, toKey: string): number {
  try {
    return ChordSheetJS.Key.distance(fromKey, toKey);
  } catch {
    return 0;
  }
}
