import { ALL_KEYS, ALL_KEYS_MINOR } from './keys';

// Pure music-theory engine shared by the Tools suite. Everything here is
// side-effect free so it can be unit-tested without a DOM.

// -- Pitch classes ----------------------------------------------------------

export type Accidental = 'sharp' | 'flat';

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export function noteToPc(note: string): number | null {
  const m = /^([A-G])([#b]{0,2})$/.exec(note.trim());
  if (!m) return null;
  let pc = LETTER_PC[m[1]];
  for (const ch of m[2]) pc += ch === '#' ? 1 : -1;
  return ((pc % 12) + 12) % 12;
}

export function pcToName(pc: number, accidental: Accidental = 'sharp'): string {
  const idx = ((pc % 12) + 12) % 12;
  return accidental === 'flat' ? FLAT_NAMES[idx] : SHARP_NAMES[idx];
}

// -- Keys -------------------------------------------------------------------

export interface KeyInfo {
  tonicPc: number;
  minor: boolean;
  /** Tonic as the user spelled it, e.g. 'Bb' (used for letter-accurate scales) */
  tonicSpelling: string;
  /** App-canonical name, e.g. 'Bbm' */
  name: string;
}

export function keyInfo(tonicPc: number, minor: boolean, tonicSpelling?: string): KeyInfo {
  const pc = ((tonicPc % 12) + 12) % 12;
  const name = minor ? ALL_KEYS_MINOR[pc] : ALL_KEYS[pc];
  return { tonicPc: pc, minor, tonicSpelling: tonicSpelling || name.replace(/m$/, ''), name };
}

export function parseKeyName(name: string): KeyInfo | null {
  const m = /^\s*([A-G][#b]?)\s*(m|min|minor)?\s*$/.exec(name);
  if (!m) return null;
  const pc = noteToPc(m[1]);
  if (pc === null) return null;
  return keyInfo(pc, !!m[2], m[1]);
}

// Semitone distance from one key's tonic to another's, normalized to -5..+6.
export function semitonesBetween(fromKey: string, toKey: string): number | null {
  const from = parseKeyName(fromKey);
  const to = parseKeyName(toKey);
  if (!from || !to) return null;
  let d = (to.tonicPc - from.tonicPc + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

// -- Scales -----------------------------------------------------------------

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 11];

function scaleSteps(minor: boolean, variant: 'natural' | 'harmonic' = 'natural'): number[] {
  if (!minor) return MAJOR_STEPS;
  return variant === 'harmonic' ? HARMONIC_MINOR_STEPS : NATURAL_MINOR_STEPS;
}

// Letter-accurate spelling (each letter used once, single accidentals only).
// Returns null when a scale would need a double accidental, e.g. G# major.
function spellScale(tonicSpelling: string, steps: number[]): string[] | null {
  const m = /^([A-G])([#b]?)$/.exec(tonicSpelling);
  if (!m) return null;
  const startIdx = LETTERS.indexOf(m[1]);
  const tonicPc = noteToPc(tonicSpelling);
  if (tonicPc === null) return null;
  const out: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const letter = LETTERS[(startIdx + i) % 7];
    const target = (tonicPc + steps[i]) % 12;
    let delta = target - LETTER_PC[letter];
    if (delta > 6) delta -= 12;
    if (delta < -6) delta += 12;
    if (Math.abs(delta) > 1) return null;
    out.push(letter + (delta === 1 ? '#' : delta === -1 ? 'b' : ''));
  }
  return out;
}

// Sharp or flat display for a key, chosen so the scale reuses as few letter
// names as possible (F major prefers Bb over A#; A major prefers C# over Db).
export function preferredAccidentalForKey(key: KeyInfo): Accidental {
  const steps = scaleSteps(key.minor);
  const pcs = steps.map((s) => (key.tonicPc + s) % 12);
  const distinct = (names: string[]) => new Set(names.map((n) => n[0])).size;
  const sharps = distinct(pcs.map((pc) => SHARP_NAMES[pc]));
  const flats = distinct(pcs.map((pc) => FLAT_NAMES[pc]));
  return flats > sharps ? 'flat' : 'sharp';
}

export function scaleNotes(key: KeyInfo, variant: 'natural' | 'harmonic' = 'natural'): string[] {
  const steps = scaleSteps(key.minor, variant);
  const spelled = spellScale(key.tonicSpelling, steps);
  if (spelled) return spelled;
  const acc = preferredAccidentalForKey(key);
  return steps.map((s) => pcToName(key.tonicPc + s, acc));
}

// -- Chord parsing ----------------------------------------------------------

export interface ParsedChord {
  symbol: string;
  root: string;
  suffix: string;
  quality: 'major' | 'minor' | 'dim' | 'aug' | 'sus' | 'other';
  bass?: string;
}

const CHORD_RE = /^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/;
// Legal chord suffix vocabulary; anything else (e.g. "men" in "Amen") rejects the token.
const SUFFIX_RE = /^(?:m(?!aj)|maj|min|dim|aug|sus|add|no|M(?![a-z])|[0-9()#b+\-°ø∆Δ])*$/;

function qualityOf(suffix: string): ParsedChord['quality'] {
  if (/^dim|^[°ø]/.test(suffix)) return 'dim';
  if (/^(m(?!aj)|min)/.test(suffix)) return 'minor';
  if (/^(aug|\+)/.test(suffix)) return 'aug';
  if (/^sus/.test(suffix)) return 'sus';
  return 'major';
}

export function parseChordSymbol(token: string): ParsedChord | null {
  const cleaned = token.trim();
  if (!cleaned || cleaned.length > 12) return null;
  const m = cleaned.match(CHORD_RE);
  if (!m) return null;
  const [, root, suffix, bass] = m;
  if (suffix && !SUFFIX_RE.test(suffix)) return null;
  const rootPc = noteToPc(root);
  if (rootPc === null) return null;

  return {
    symbol: cleaned,
    root: pcToName(rootPc, root.includes('b') ? 'flat' : 'sharp'),
    suffix: suffix || '',
    quality: qualityOf(suffix || ''),
    ...(bass ? { bass: pcToName(noteToPc(bass)!, bass.includes('b') ? 'flat' : 'sharp') } : {}),
  };
}

// -- Transposition ----------------------------------------------------------

// Transpose a single chord symbol, preserving suffix and slash bass.
export function transposeChord(symbol: string, semitones: number, accidental: Accidental = 'sharp'): string {
  const p = parseChordSymbol(symbol);
  if (!p) return symbol;
  const rootPc = noteToPc(p.root);
  if (rootPc === null) return symbol;
  let out = pcToName(rootPc + semitones, accidental) + p.suffix;
  if (p.bass) {
    const bassPc = noteToPc(p.bass);
    if (bassPc !== null) out += '/' + pcToName(bassPc + semitones, accidental);
  }
  return out;
}

// -- Chart transformation ---------------------------------------------------

export type TokenMapper = (token: string) => string | null;

const BRACKET_RE = /\[([^\]]+)\]/g;
const DIRECTIVE_LINE_RE = /^\s*\{[^}]*\}\s*$/;
const KEY_DIRECTIVE_RE = /^(\s*\{key:\s*)([^}]*?)(\s*\}\s*)$/i;
// Tokens that live on chord lines but are not chords (bars, repeats, rests).
// Exported so other chart-parsing code (chords.ts's compact-bar notation) can
// recognize the same vocabulary instead of maintaining a second definition.
export const SEPARATOR_TOKEN_RE = /^(?:-+|\/+|%|x\d+|\d+x|N\.?C\.?)$/i;

function peelToken(chunk: string): { lead: string; core: string; trail: string } {
  const lead = chunk.match(/^[([|]+/)?.[0] ?? '';
  const rest = chunk.slice(lead.length);
  const trail = rest.match(/[)\]|,.:]+$/)?.[0] ?? '';
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

// Applies `mapToken` to every chord-shaped token in a chart while leaving
// lyrics, directives, comments, whitespace and section labels untouched.
// Handles bracketed ChordPro chords and bare chord lines (a line counts as a
// chord line when most of its tokens map successfully).
export function transformChart(
  text: string,
  mapToken: TokenMapper,
  opts: { mapKeyDirective?: (value: string) => string | null } = {},
): string {
  return text
    .split('\n')
    .map((line) => {
      const keyMatch = line.match(KEY_DIRECTIVE_RE);
      if (keyMatch) {
        const mapped = opts.mapKeyDirective?.(keyMatch[2]);
        return mapped ? keyMatch[1] + mapped + keyMatch[3] : line;
      }
      if (DIRECTIVE_LINE_RE.test(line) || /^\s*#/.test(line)) return line;

      if (line.includes('[')) {
        let replaced = false;
        const out = line.replace(BRACKET_RE, (whole, inner: string) => {
          const mapped = mapToken(inner.trim());
          if (mapped === null) return whole;
          replaced = true;
          return `[${mapped}]`;
        });
        if (replaced) return out;
        // No bracket held a chord (e.g. a [Chorus] label); try the line as tokens.
      }

      const chunks = line.split(/(\s+)/);
      let candidates = 0;
      let hits = 0;
      const mapped = chunks.map((chunk) => {
        if (!chunk || /^\s+$/.test(chunk)) return chunk;
        const { lead, core, trail } = peelToken(chunk);
        if (!core || SEPARATOR_TOKEN_RE.test(core)) return chunk;
        candidates++;
        const result = mapToken(core);
        if (result === null) return chunk;
        hits++;
        return lead + result + trail;
      });
      // Treat as a chord line only when most tokens are chords (skips lyric lines)
      if (candidates > 0 && hits / candidates >= 0.6) return mapped.join('');
      return line;
    })
    .join('\n');
}

// Transpose a whole chart (ChordPro or chords-over-lyrics or bare progression),
// preserving lyrics, formatting, directives, suffixes and slash chords.
// A {key: X} directive is transposed along with the chords.
export function transposeChart(text: string, semitones: number, accidental: Accidental = 'sharp'): string {
  return transformChart(
    text,
    (token) => (parseChordSymbol(token) ? transposeChord(token, semitones, accidental) : null),
    {
      mapKeyDirective: (value) => {
        const key = parseKeyName(value.trim());
        if (!key) return null;
        return pcToName(key.tonicPc + semitones, accidental) + (key.minor ? 'm' : '');
      },
    },
  );
}

// -- Nashville numbers ------------------------------------------------------

// Degree label for each chromatic offset from the tonic, measured against the
// major scale of the tonic (the common Nashville convention — minor keys read
// b3, b6, b7 for their diatonic chords).
export const DEGREE_FOR_OFFSET = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

export function chordToNashville(symbol: string, key: KeyInfo): string | null {
  const p = parseChordSymbol(symbol);
  if (!p) return null;
  const rootPc = noteToPc(p.root);
  if (rootPc === null) return null;
  let out = DEGREE_FOR_OFFSET[(rootPc - key.tonicPc + 12) % 12] + p.suffix;
  if (p.bass) {
    const bassPc = noteToPc(p.bass);
    if (bassPc !== null) out += '/' + DEGREE_FOR_OFFSET[(bassPc - key.tonicPc + 12) % 12];
  }
  return out;
}

const NASHVILLE_RE = /^([b#]?)([1-7])([^/]*)(?:\/([b#]?[1-7]))?$/;

export function nashvilleToChord(token: string, key: KeyInfo, accidental: Accidental = 'sharp'): string | null {
  const m = NASHVILLE_RE.exec(token.trim());
  if (!m) return null;
  const [, acc, num, suffix, bass] = m;
  if (suffix && !SUFFIX_RE.test(suffix)) return null;
  const pcOf = (a: string, n: string) =>
    (key.tonicPc + MAJOR_STEPS[parseInt(n, 10) - 1] + (a === '#' ? 1 : a === 'b' ? -1 : 0) + 12) % 12;
  let out = pcToName(pcOf(acc, num), accidental) + (suffix || '');
  if (bass) {
    const bm = /^([b#]?)([1-7])$/.exec(bass)!;
    out += '/' + pcToName(pcOf(bm[1], bm[2]), accidental);
  }
  return out;
}

export function chartToNashville(text: string, key: KeyInfo): string {
  return transformChart(text, (token) => chordToNashville(token, key));
}

export function nashvilleChartToChords(text: string, key: KeyInfo, accidental: Accidental = 'sharp'): string {
  return transformChart(text, (token) => nashvilleToChord(token, key, accidental));
}

// -- Diatonic chords --------------------------------------------------------

interface TriadDef {
  off: number;
  q: 'major' | 'minor' | 'dim';
  roman: string;
}

const MAJOR_TRIADS: TriadDef[] = [
  { off: 0, q: 'major', roman: 'I' },
  { off: 2, q: 'minor', roman: 'ii' },
  { off: 4, q: 'minor', roman: 'iii' },
  { off: 5, q: 'major', roman: 'IV' },
  { off: 7, q: 'major', roman: 'V' },
  { off: 9, q: 'minor', roman: 'vi' },
  { off: 11, q: 'dim', roman: 'vii°' },
];

const MINOR_TRIADS: TriadDef[] = [
  { off: 0, q: 'minor', roman: 'i' },
  { off: 2, q: 'dim', roman: 'ii°' },
  { off: 3, q: 'major', roman: 'III' },
  { off: 5, q: 'minor', roman: 'iv' },
  { off: 7, q: 'minor', roman: 'v' },
  { off: 8, q: 'major', roman: 'VI' },
  { off: 10, q: 'major', roman: 'VII' },
];

// Chords minor keys borrow from harmonic minor so often they count as diatonic
const MINOR_HARMONIC_EXTRAS: TriadDef[] = [
  { off: 7, q: 'major', roman: 'V' },
  { off: 11, q: 'dim', roman: 'vii°' },
];

function qualitySuffix(q: TriadDef['q']): string {
  return q === 'minor' ? 'm' : q === 'dim' ? 'dim' : '';
}

function nashvilleMark(q: TriadDef['q']): string {
  return q === 'minor' ? 'm' : q === 'dim' ? '°' : '';
}

export interface DiatonicChord {
  degree: number; // 1-7 position in the scale
  roman: string;
  nashville: string;
  symbol: string; // e.g. 'Em' or 'F#dim'
  quality: 'major' | 'minor' | 'dim';
  notes: string[]; // triad tones
}

export function diatonicTriads(key: KeyInfo, accidental?: Accidental): DiatonicChord[] {
  const acc = accidental || preferredAccidentalForKey(key);
  const defs = key.minor ? MINOR_TRIADS : MAJOR_TRIADS;
  return defs.map((d, i) => {
    const rootPc = (key.tonicPc + d.off) % 12;
    const root = pcToName(rootPc, acc);
    const third = pcToName(rootPc + (d.q === 'major' ? 4 : 3), acc);
    const fifth = pcToName(rootPc + (d.q === 'dim' ? 6 : 7), acc);
    return {
      degree: i + 1,
      roman: d.roman,
      nashville: DEGREE_FOR_OFFSET[d.off] + nashvilleMark(d.q),
      symbol: root + qualitySuffix(d.q),
      quality: d.q,
      notes: [root, third, fifth],
    };
  });
}

// -- Degree labelling for arbitrary chords ----------------------------------

export interface DegreeLabel {
  roman: string;
  nashville: string;
  diatonic: boolean;
}

// How a chord functions in a key: diatonic degree, or a borrowed-chord label
// like bVII when it falls outside the scale.
export function chordDegree(chord: ParsedChord, key: KeyInfo): DegreeLabel | null {
  const rootPc = noteToPc(chord.root);
  if (rootPc === null) return null;
  const off = (rootPc - key.tonicPc + 12) % 12;
  const defs = key.minor ? [...MINOR_TRIADS, ...MINOR_HARMONIC_EXTRAS] : MAJOR_TRIADS;
  const atOffset = defs.filter((d) => d.off === off);
  const exact =
    atOffset.find((d) => d.q === chord.quality) ||
    (chord.quality === 'sus' || chord.quality === 'other' || chord.quality === 'aug' ? atOffset[0] : undefined);
  if (exact) {
    return {
      roman: exact.roman,
      nashville: DEGREE_FOR_OFFSET[off] + nashvilleMark(exact.q),
      diatonic: true,
    };
  }
  // Borrowed / out-of-key: build a label from the chromatic degree
  const token = DEGREE_FOR_OFFSET[off];
  const accPrefix = token.replace(/[0-9]/g, '');
  const num = parseInt(token.replace(/[b#]/g, ''), 10);
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  let roman = numerals[num - 1];
  if (chord.quality === 'minor' || chord.quality === 'dim') roman = roman.toLowerCase();
  if (chord.quality === 'dim') roman += '°';
  if (chord.quality === 'aug') roman += '+';
  return {
    roman: accPrefix + roman,
    nashville: token + (chord.quality === 'minor' ? 'm' : chord.quality === 'dim' ? '°' : ''),
    diatonic: false,
  };
}

// -- Relative keys ----------------------------------------------------------

export function relativeKey(key: KeyInfo): KeyInfo {
  return key.minor ? keyInfo(key.tonicPc + 3, false) : keyInfo(key.tonicPc + 9, true);
}

// -- Common worship progressions -------------------------------------------

export interface ProgressionDef {
  label: string; // Roman-numeral shorthand
  tokens: string[]; // Nashville tokens, rendered per key via nashvilleToChord
}

export const WORSHIP_PROGRESSIONS_MAJOR: ProgressionDef[] = [
  { label: 'I – V – vi – IV', tokens: ['1', '5', '6m', '4'] },
  { label: 'vi – IV – I – V', tokens: ['6m', '4', '1', '5'] },
  { label: 'I – IV – vi – V', tokens: ['1', '4', '6m', '5'] },
  { label: 'I – vi – IV – V', tokens: ['1', '6m', '4', '5'] },
  { label: 'IV – I – V – vi', tokens: ['4', '1', '5', '6m'] },
];

export const WORSHIP_PROGRESSIONS_MINOR: ProgressionDef[] = [
  { label: 'i – bVI – bIII – bVII', tokens: ['1m', 'b6', 'b3', 'b7'] },
  { label: 'i – bVII – bVI – V', tokens: ['1m', 'b7', 'b6', '5'] },
  { label: 'i – iv – bVI – V', tokens: ['1m', '4m', 'b6', '5'] },
  { label: 'i – bIII – bVII – iv', tokens: ['1m', 'b3', 'b7', '4m'] },
];

export function renderProgression(tokens: string[], key: KeyInfo, accidental?: Accidental): string[] {
  const acc = accidental || preferredAccidentalForKey(key);
  return tokens.map((t) => nashvilleToChord(t, key, acc) || t);
}
