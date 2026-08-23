import { describe, it, expect } from 'vitest';
import { normalizeKey, normalizeChord, preferredAccidental, getTransposeDelta } from '../keys';

describe('keys library', () => {
  describe('normalizeKey', () => {
    it('prefers G# over Ab', () => {
      expect(normalizeKey('Ab')).toBe('G#');
      expect(normalizeKey('Abm')).toBe('G#m');
    });

    it('prefers C# over Db', () => {
      expect(normalizeKey('Db')).toBe('C#');
      expect(normalizeKey('Dbm')).toBe('C#m');
    });

    it('prefers F# over Gb', () => {
      expect(normalizeKey('Gb')).toBe('F#');
      expect(normalizeKey('Gbm')).toBe('F#m');
    });

    it('prefers Bb over A# (exception)', () => {
      expect(normalizeKey('A#')).toBe('Bb');
      expect(normalizeKey('A#m')).toBe('Bbm');
    });

    it('prefers Eb over D# (exception)', () => {
      expect(normalizeKey('D#')).toBe('Eb');
      expect(normalizeKey('D#m')).toBe('Ebm');
    });

    it('leaves already normalized keys alone', () => {
      expect(normalizeKey('G#')).toBe('G#');
      expect(normalizeKey('Bb')).toBe('Bb');
      expect(normalizeKey('C')).toBe('C');
    });
  });

  // normalizeChord used to force every chord root through the same map as
  // normalizeKey (Db->C#, Gb->F#, Ab->G#, plus the Bb/Eb exceptions), applied
  // independently per chord regardless of the destination key. That's what
  // caused the flat-key transposition bug: a song transposed to "Ab" (G#)
  // could render as G# Bbm Cm C# Eb Fm Gdim — four different spellings in
  // one seven-chord line, since Bb/Eb happened to already come out flat from
  // the library while Db/Gb/Ab got forced back to sharp regardless of
  // context. The fix (see prepareSong in chords.ts) now transposes the whole
  // song with one consistent accidental chosen via preferredAccidental
  // below, so normalizeChord's job shrinks to only the handful of spellings
  // that are wrong in EVERY context, not just some.
  describe('normalizeChord', () => {
    it('rewrites A# and D# as Bb and Eb regardless of context', () => {
      expect(normalizeChord('A#')).toBe('Bb');
      expect(normalizeChord('D#sus4')).toBe('Ebsus4');
      expect(normalizeChord('A#m7')).toBe('Bbm7');
      expect(normalizeChord('D#m')).toBe('Ebm');
    });

    // Transposing to F# from G, A or B lands the library in Gb, which spells the
    // IV chord Cb. The key badge already reads F#, so the sheet showed Cb under an
    // F# heading. Nobody writes Cb on a chord chart.
    it('rewrites Cb as B', () => {
      expect(normalizeChord('Cb')).toBe('B');
      expect(normalizeChord('Cb7')).toBe('B7');
      expect(normalizeChord('Cbsus4')).toBe('Bsus4');
    });

    it('rewrites Cb as B when the suffix starts with m', () => {
      // The root regex is /[A-G][b#]?m?/, so it swallows the m of "maj7" and looks
      // up "Cbm" — a Cb entry alone leaves Cbmaj7 untouched.
      expect(normalizeChord('Cbm')).toBe('Bm');
      expect(normalizeChord('Cbmaj7')).toBe('Bmaj7');
    });

    it('rewrites Cb in the bass of a slash chord', () => {
      expect(normalizeChord('G/Cb')).toBe('G/B');
    });

    // Fb (=E) and B#/E# (=C/F) are the same phenomenon as Cb in the other
    // three corners of the circle — legitimate once a whole song is forced to
    // one accidental, but nobody writes them. Found via an exhaustive
    // semitone scan while fixing the flat-key spelling-consistency bug: every
    // offset from 1-11 semitones was checked against ChordSheetJS's raw
    // accidental:'#'/'b' output, and B#, E#, Cb and Fb all showed up.
    it('rewrites Fb as E', () => {
      expect(normalizeChord('Fb')).toBe('E');
      expect(normalizeChord('Fbmaj7')).toBe('Emaj7');
      expect(normalizeChord('Fbm')).toBe('Em');
      expect(normalizeChord('C/Fb')).toBe('C/E');
    });

    it('rewrites B# as C', () => {
      expect(normalizeChord('B#')).toBe('C');
      expect(normalizeChord('B#maj7')).toBe('Cmaj7');
      expect(normalizeChord('B#m')).toBe('Cm');
      expect(normalizeChord('G#/B#')).toBe('G#/C');
    });

    it('rewrites E# as F', () => {
      expect(normalizeChord('E#')).toBe('F');
      expect(normalizeChord('E#maj7')).toBe('Fmaj7');
      expect(normalizeChord('E#m')).toBe('Fm');
    });

    // The historically-ambiguous pairs (Db/C#, Gb/F#, Ab/G#) are deliberately
    // left alone here — normalizeChord no longer picks a side for them.
    // Which one a song should use now depends on the destination key
    // (preferredAccidental, tested below), applied once for the whole song
    // via prepareSong's accidental-aware transpose, not per chord in
    // isolation.
    it('leaves Db, Gb and Ab untouched (handled by accidental-aware transpose instead)', () => {
      expect(normalizeChord('Db')).toBe('Db');
      expect(normalizeChord('Gb7')).toBe('Gb7');
      expect(normalizeChord('Abm7')).toBe('Abm7');
      expect(normalizeChord('E/Ab')).toBe('E/Ab');
    });
  });

  describe('preferredAccidental', () => {
    it('prefers sharp for the historically-ambiguous keys', () => {
      expect(preferredAccidental('C#')).toBe('#');
      expect(preferredAccidental('Db')).toBe('#');
      expect(preferredAccidental('F#')).toBe('#');
      expect(preferredAccidental('Gb')).toBe('#');
      expect(preferredAccidental('G#')).toBe('#');
      expect(preferredAccidental('Ab')).toBe('#');
    });

    it('prefers flat only for the two keys ALL_KEYS itself labels with a flat', () => {
      expect(preferredAccidental('Eb')).toBe('b');
      expect(preferredAccidental('D#')).toBe('b');
      expect(preferredAccidental('Bb')).toBe('b');
      expect(preferredAccidental('A#')).toBe('b');
    });

    it('defaults natural keys to sharp, matching the app default', () => {
      expect(preferredAccidental('C')).toBe('#');
      expect(preferredAccidental('F')).toBe('#');
      expect(preferredAccidental('G')).toBe('#');
    });

    it('handles minor keys the same way as their major counterparts', () => {
      expect(preferredAccidental('Ebm')).toBe('b');
      expect(preferredAccidental('Bbm')).toBe('b');
      expect(preferredAccidental('G#m')).toBe('#');
      expect(preferredAccidental('Abm')).toBe('#');
    });
  });

  describe('getTransposeDelta', () => {
    it('calculates 0 for identical keys', () => {
      expect(getTransposeDelta('C', 'C')).toBe(0);
      expect(getTransposeDelta('C#', 'Db')).toBe(0);
    });

    it('always counts upward, never returning a negative', () => {
      expect(getTransposeDelta('C', 'D')).toBe(2);
      expect(getTransposeDelta('C', 'G')).toBe(7);
      expect(getTransposeDelta('C', 'B')).toBe(11);
      expect(getTransposeDelta('B', 'C')).toBe(1);
      expect(getTransposeDelta('G', 'C')).toBe(5);
    });

    it('handles minor keys correctly', () => {
      expect(getTransposeDelta('Am', 'Dm')).toBe(5);
      expect(getTransposeDelta('Cm', 'Gm')).toBe(7);
    });

    it('gives the tritone as 6 in both directions', () => {
      expect(getTransposeDelta('C', 'F#')).toBe(6);
      expect(getTransposeDelta('F#', 'C')).toBe(6);
    });

    it('resolves enharmonic spellings without the accidental map', () => {
      expect(getTransposeDelta('Db', 'D')).toBe(1);
      expect(getTransposeDelta('Gb', 'G')).toBe(1);
      expect(getTransposeDelta('Ebm', 'Fm')).toBe(2);
    });

    it('reads H as German notation for B natural', () => {
      expect(getTransposeDelta('H', 'C')).toBe(1);
      expect(getTransposeDelta('C', 'H')).toBe(11);
    });

    it('returns 0 for unparseable keys', () => {
      expect(getTransposeDelta('Chorus', 'C')).toBe(0);
      expect(getTransposeDelta('C', 'Chorus')).toBe(0);
      expect(getTransposeDelta('', 'C')).toBe(0);
      expect(getTransposeDelta('C major', 'C')).toBe(0);
    });
  });
});
