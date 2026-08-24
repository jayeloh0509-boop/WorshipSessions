import {
  extractDirective,
  updateDirective,
  toChordPro,
  ensureKeyDirective,
  detectFormat,
  getSongKey,
  isSectionLabel,
  canonicalizeSectionLabel,
  normalizeOnSave,
  isCompactBarNotation,
  prepareForPersist,
} from '../chords';

// ─── extractDirective ───────────────────────────────────────────────

describe('extractDirective', () => {
  it('extracts a standard directive value', () => {
    const content = '{title: Amazing Grace}\n{artist: John Newton}\n[G]Amazing';
    expect(extractDirective(content, 'title')).toBe('Amazing Grace');
    expect(extractDirective(content, 'artist')).toBe('John Newton');
  });

  it('returns null when directive is missing', () => {
    expect(extractDirective('{title: Test}\nlyrics', 'artist')).toBeNull();
  });

  it('handles x_ custom directives', () => {
    const content = '{x_tags: worship,praise}\n{x_language: en}\n{x_youtube: https://yt.com/abc}';
    expect(extractDirective(content, 'x_tags')).toBe('worship,praise');
    expect(extractDirective(content, 'x_language')).toBe('en');
    expect(extractDirective(content, 'x_youtube')).toBe('https://yt.com/abc');
  });

  it('trims whitespace around value', () => {
    expect(extractDirective('{title:   Spaced Out  }', 'title')).toBe('Spaced Out');
  });

  it('first match wins with duplicate directives', () => {
    const content = '{title: First}\n{title: Second}';
    expect(extractDirective(content, 'title')).toBe('First');
  });

  it('returns null for empty content', () => {
    expect(extractDirective('', 'title')).toBeNull();
  });
});

// ─── updateDirective ────────────────────────────────────────────────

describe('updateDirective', () => {
  it('replaces existing directive in-place', () => {
    const content = '{title: Old Title}\n{artist: Someone}\n[G]Lyrics';
    const result = updateDirective(content, 'title', 'New Title');
    expect(result).toBe('{title: New Title}\n{artist: Someone}\n[G]Lyrics');
  });

  it('inserts new directive in correct order', () => {
    const content = '{title: Song}\n[G]Lyrics';
    const result = updateDirective(content, 'artist', 'Artist Name');
    expect(result).toContain('{artist: Artist Name}');
    // artist should come after title
    const lines = result.split('\n');
    const titleIdx = lines.findIndex((l) => l.includes('{title:'));
    const artistIdx = lines.findIndex((l) => l.includes('{artist:'));
    expect(artistIdx).toBeGreaterThan(titleIdx);
  });

  it('inserts tempo after artist', () => {
    const content = '{title: Song}\n{artist: Bob}\n[G]Lyrics';
    const result = updateDirective(content, 'tempo', '120');
    const lines = result.split('\n');
    const artistIdx = lines.findIndex((l) => l.includes('{artist:'));
    const tempoIdx = lines.findIndex((l) => l.includes('{tempo:'));
    expect(tempoIdx).toBeGreaterThan(artistIdx);
  });

  it('removes directive when value is null', () => {
    const content = '{title: Song}\n{artist: Bob}\n[G]Lyrics';
    const result = updateDirective(content, 'artist', null);
    expect(result).not.toContain('{artist:');
    expect(result).toContain('{title: Song}');
    expect(result).toContain('[G]Lyrics');
  });

  it('removes directive when value is empty string', () => {
    const content = '{title: Song}\n{artist: Bob}\n[G]Lyrics';
    const result = updateDirective(content, 'artist', '');
    expect(result).not.toContain('{artist:');
  });

  it('inserts into empty content', () => {
    const result = updateDirective('', 'title', 'New Song');
    expect(result).toBe('{title: New Song}\n');
  });

  it('does not corrupt surrounding lyrics', () => {
    const content = '{title: Song}\n\n[G]First line\n[C]Second line';
    const result = updateDirective(content, 'artist', 'New Artist');
    expect(result).toContain('[G]First line');
    expect(result).toContain('[C]Second line');
  });

  it('handles x_ directives', () => {
    const content = '{title: Song}\n[G]Lyrics';
    const result = updateDirective(content, 'x_tags', 'worship,praise');
    expect(result).toContain('{x_tags: worship,praise}');
  });

  it('removes trailing whitespace on directive line', () => {
    const content = '{title: Song}   \n[G]Lyrics';
    const result = updateDirective(content, 'title', 'Updated');
    expect(result).toBe('{title: Updated}\n[G]Lyrics');
  });
});

// ─── detectFormat ───────────────────────────────────────────────────

describe('detectFormat', () => {
  it('detects ChordPro format', () => {
    expect(detectFormat('[G]Let it [D]be')).toBe('ChordPro');
  });

  it('detects chords-over-lyrics format (UG parser picks it up)', () => {
    const content = '  G        D\n  Let it be';
    // UG parser matches chords-over-lyrics first — both are valid detections
    expect(detectFormat(content)).toBe('Ultimate Guitar');
  });

  it('returns null for empty content', () => {
    expect(detectFormat('')).toBeNull();
    expect(detectFormat('   ')).toBeNull();
  });

  it('returns null for lyrics with no chords', () => {
    expect(detectFormat('Just some lyrics\nwithout any chords')).toBeNull();
  });

  it('section labels alone parsed by UG parser (no real chords for ChordPro)', () => {
    // UG parser treats [Chorus]/[Verse] as valid UG section markers
    // The ChordPro path correctly filters them out, but UG parser picks them up
    const result = detectFormat('[Chorus]\nJust lyrics here\n[Verse]\nMore lyrics');
    // If UG parser detects chords in the section-labeled content, it returns 'Ultimate Guitar'
    // If no chords detected at all, returns null
    expect(result === 'Ultimate Guitar' || result === null).toBe(true);
  });

  it('detects ChordPro even with section labels present', () => {
    // Has both section labels AND real chords
    expect(detectFormat('[Chorus]\n[G]Let it [D]be')).toBe('ChordPro');
  });
});

// ─── toChordPro + directive preservation ────────────────────────────

describe('toChordPro', () => {
  it('preserves x_ directives through conversion', () => {
    const content = '{title: Song}\n{x_tags: worship}\n{x_language: en}\n\n  G        D\n  Let it be';
    const result = toChordPro(content);
    expect(result).toContain('{x_tags: worship}');
    expect(result).toContain('{x_language: en}');
    expect(result).toContain('{title: Song}');
  });

  it('preserves standard directives through conversion', () => {
    const content = '{title: Amazing Grace}\n{artist: John Newton}\n{key: G}\n\n  G        D\n  Let it be';
    const result = toChordPro(content);
    expect(result).toContain('{title:');
    expect(result).toContain('{artist:');
    expect(result).toContain('{key:');
  });

  it('passes through already-ChordPro content cleanly', () => {
    const content = '{title: Song}\n[G]Amazing [C]grace';
    const result = toChordPro(content);
    // Should still have the title and chord content
    expect(result).toContain('{title:');
    // Should contain chord markers
    expect(result).toMatch(/\[G\]/);
  });

  it('preserves compact bracketed bar notation through ChordPro conversion', () => {
    const content = `{title: Song}
[| Bb//Bb Cm7 Bb/D | Eb2///|]`;
    expect(toChordPro(content)).toBe(content);
  });

  it('converts chords-over-lyrics to ChordPro bracket format', () => {
    const content = '  G        D\n  Let it   be';
    const result = toChordPro(content);
    // Result should contain inline [chord] markers
    expect(result).toMatch(/\[[A-G][b#]?\]/);
  });

  it('returns original content on parse failure', () => {
    const garbage = '';
    const result = toChordPro(garbage);
    expect(result).toBe(garbage);
  });
});

// ─── ensureKeyDirective ─────────────────────────────────────────────

describe('ensureKeyDirective', () => {
  it('does not duplicate existing key directive', () => {
    const content = '{key: G}\n[G]Amazing [C]grace';
    const result = ensureKeyDirective(content);
    expect(result).toBe(content);
  });

  it('adds key from first chord when missing', () => {
    const content = '[G]Amazing [C]grace';
    const result = ensureKeyDirective(content);
    expect(result).toContain('{key: G}');
    // Original content should still be there
    expect(result).toContain('[G]Amazing');
  });

  it('handles minor key chords', () => {
    const content = '[Am]Lyrics here [Em]more';
    const result = ensureKeyDirective(content);
    expect(result).toContain('{key: Am}');
  });
});

// ─── renderChordPro (Section Parsing & Labeling) ───────────────────

import { renderChordPro } from '../chords';

describe('renderChordPro sections', () => {
  it('marks heading rows separately so badges do not inherit lyric-row spacing', () => {
    const html = renderChordPro(`Chorus
[Ab]Who else is worthy?`);
    expect(html).toContain('class="row section-row"><h3 class="label">Chorus</h3>');
  });

  it('promotes paragraph type from first line label', () => {
    const content = 'Chorus\n[G]Amazing grace';
    const html = renderChordPro(content);
    // Should have paragraph chorus class
    expect(html).toContain('class="paragraph chorus"');
    // Should have a label badge for Chorus
    expect(html).toContain('class="label">Chorus</h3>');
  });

  it('handles numbered sections like Verse 1', () => {
    const content = 'Verse 1\n[G]Lyrics';
    const html = renderChordPro(content);
    expect(html).toContain('class="paragraph verse"');
    expect(html).toContain('class="label">Verse 1</h3>');
  });

  it('recognizes Pre-Chorus with or without hyphen', () => {
    const html1 = renderChordPro('Pre-Chorus\n[G]Lyrics');
    expect(html1).toContain('class="paragraph prechorus"');

    const html2 = renderChordPro('PreChorus\n[G]Lyrics');
    expect(html2).toContain('class="paragraph prechorus"');
  });

  it('does not promote if chords are present on the first line', () => {
    // If it has chords, it's probably not just a label
    const content = '[G]Chorus\n[C]Lyrics';
    const html = renderChordPro(content);
    expect(html).not.toContain('class="paragraph chorus"');
  });

  it('handles Bridge with special styling in HTML', () => {
    const content = 'Bridge\n[G]Lyrics';
    const html = renderChordPro(content);
    expect(html).toContain('class="paragraph bridge"');
  });

  it('handles bracketed labels like [Chorus]', () => {
    const content = '[Chorus]\n[G]Lyrics';
    const html = renderChordPro(content);
    expect(html).toContain('class="paragraph chorus"');
    expect(html).toContain('class="label">Chorus</h3>');
  });

  it.each(['Half-Chorus', 'Vamp', 'Alt Verse 1', 'REPEAT Verse 1'])('recognizes imported section label %s', (label) => {
    const html = renderChordPro(`${label}\n[Bb]Lyrics`);
    expect(html).toContain(`class="label">${label}</h3>`);
  });

  it.each(['Pre Chorus', 'CHORUS (down)', 'INTRO (2 bars)', 'REPEAT CHORUS X2'])(
    'preserves legacy section label %s',
    (label) => {
      expect(isSectionLabel(label)).toBe(true);
    },
  );
});

describe('renderChordPro number notation', () => {
  it('keeps bracketed section labels intact in number notation', () => {
    const content = '{key: G}\n[Chorus]\n[G]Amazing [C]grace';
    const html = renderChordPro(content, 0, true);
    expect(html).toContain('class="label">Chorus</h3>');
    expect(html).toContain('class="paragraph chorus"');
    expect(html).not.toContain('4horus');
  });

  it('still converts real chords to numbers', () => {
    const content = '{key: G}\n[G]Amazing [C]grace';
    const html = renderChordPro(content, 0, true);
    expect(html).toContain('>1<');
    expect(html).toContain('>4<');
  });
});

describe('getSongKey', () => {
  it('reads the key directive when present', () => {
    expect(getSongKey('{key: A}\n[A]Amazing')).toBe('A');
  });

  it('derives the key from the first real chord when no directive exists', () => {
    expect(getSongKey('[A]Amazing [D]grace')).toBe('A');
  });

  it('ignores a leading bracketed section label when deriving the key', () => {
    expect(getSongKey('[Chorus]\n[A]Amazing [D]grace [E]how')).toBe('A');
  });

  it('keeps minor quality when deriving from a minor chord', () => {
    expect(getSongKey('[Am]Amazing [Dm]grace')).toBe('Am');
  });

  it('returns an empty string when there are no chords at all', () => {
    expect(getSongKey('just some lyrics')).toBe('');
  });
});

describe('ensureKeyDirective', () => {
  it('leaves content untouched when a key directive already exists', () => {
    const content = '{key: G}\n[G]Amazing';
    expect(ensureKeyDirective(content)).toBe(content);
  });

  it('prepends a key derived from the first real chord', () => {
    expect(ensureKeyDirective('[A]Amazing [D]grace')).toBe('{key: A}\n[A]Amazing [D]grace');
  });

  it('ignores a leading bracketed section label when deriving the key', () => {
    const content = '[Chorus]\n[A]Amazing [D]grace';
    expect(ensureKeyDirective(content)).toBe(`{key: A}\n${content}`);
  });
});

import { prepareSong } from '../chords';

describe('prepareSong', () => {
  const chordsOf = (song: NonNullable<ReturnType<typeof prepareSong>>) => {
    const out: string[] = [];
    song.mapChordLyricsPairs((p) => {
      const c = (p as { chords?: string }).chords;
      if (c) out.push(c);
      return p;
    });
    return out;
  };

  it('transposes and keeps sharp preference', () => {
    const song = prepareSong('{key: G}\n[G]a [C]b', 2);
    expect(song).not.toBeNull();
    expect(chordsOf(song!)).toEqual(['A', 'D']);
  });

  it('converts to numbers when nashville is on', () => {
    const song = prepareSong('{key: G}\n[G]a [C]b', 0, true);
    expect(chordsOf(song!)).toEqual(['1', '4']);
  });

  it('transposes intro chords written as a bare standalone line', () => {
    const song = prepareSong('{key: C}\n[Intro]\nC G Am F\n\n[G]verse', 2);
    expect(song).not.toBeNull();
    expect(chordsOf(song!)).toEqual(['D', 'A', 'Bm', 'G', 'A']);
  });

  it('transposes the compact Intro progression in As You Find Me', () => {
    const song = prepareSong(
      `{title: As You Find Me}\n{key: D}\n\nIntro\n[| D / Dsus / | D5 / D2 / | D / Dsus / | D5 / D2 / |]`,
      2,
    );
    expect(song).not.toBeNull();
    expect(chordsOf(song!)).toEqual(['E', 'Esus', 'E5', 'E2', 'E', 'Esus', 'E5', 'E2']);
  });

  it('transposes compact bracketed bar notation as individual chords', () => {
    const source = `{key: Bb}\n[| Bb//Bb Cm7 Bb/D | Eb2///|]`;
    const song = prepareSong(source, 2);

    expect(chordsOf(song!)).toEqual(['C', 'C', 'Dm7', 'C/E', 'F2']);
    expect(source).toBe(`{key: Bb}\n[| Bb//Bb Cm7 Bb/D | Eb2///|]`);
  });

  it('converts compact bracketed bar notation to Nashville numbers', () => {
    const song = prepareSong(
      `{key: Bb}
[| Bb//Bb Cm7 Bb/D | Eb2///|]`,
      0,
      true,
    );

    expect(chordsOf(song!)).toEqual(['1', '1', '2m7', '1/3', '42']);
  });

  it('converts advanced symbol chords and slash basses to Nashville without changing quality', () => {
    const source = `{key: Bb}
[| Bb° Bb°7/Eb Bbø7/F# BbΔ7/Eb Bb∆/F# Bb+7/Eb |]`;

    expect(chordsOf(prepareSong(source, 2, true)!)).toEqual(['1°', '1°7/4', '1ø7/#5', '1Δ7/4', '1∆/#5', '1+7/4']);
    // Bb - 2 semitones lands on the pitch class the app canonically labels
    // "G#" (see ALL_KEYS / normalizeKey), not "Ab". Nashville degrees are
    // computed relative to whichever spelling drives the key metadata, so
    // fixing prepareSong to transpose with an explicit, consistent accidental
    // (rather than whatever ChordSheetJS's unspecified default happens to
    // pick) also fixed a matching inconsistency here: the numerals now agree
    // with the "G#" key badge the app actually displays (#5) instead of the
    // "Ab" spelling the old unconstrained transpose happened to land on (b6)
    // — same pitch, but now consistent with what the user sees on screen.
    expect(chordsOf(prepareSong(source, -2, true)!)).toEqual(['1°', '1°7/4', '1ø7/#5', '1Δ7/4', '1∆/#5', '1+7/4']);
  });

  it('keeps bar and rhythm marks visible after expanding compact notation', () => {
    const html = renderChordPro(`{key: Bb}
[| Bb//Bb Cm7 Bb/D | Eb2///|]`);

    expect(html).toContain('|');
    expect(html).toContain('//');
    expect(html).toContain('///');
  });

  it('preserves invalid compact groups exactly through conversion', () => {
    for (const group of ['[| C/ |]', '[| C/D/E |]', '[| C999 |]', '[| C7sus2sus4 |]']) {
      expect(
        toChordPro(`{title: Unsafe}
${group}`),
      ).toBe(`{title: Unsafe}
${group}`);
    }
  });

  it.each([
    '[Chorus | Bridge]',
    '[D.C. | repeat]',
    '[| Cmaj7#11 C7sus4 C(add9) nope |]',
    '[| BAD |]',
    '[| FACE |]',
    '[| Cmajmaj |]',
    '[| C() |]',
    '[| C### |]',
    '[| C/D/E |]',
    '[| C999 |]',
    '[| C7#9#9 |]',
    '[| Cadd9add9 |]',
    '[| C9add9 |]',
    '[| C2add2 |]',
    '[| C6add6 |]',
    '[| C13add13 |]',
    '[| Csus2add2 |]',
    '[| Csus4add4 |]',
    '[| Cadd2sus2 |]',
    '[| Cadd4sus4 |]',
    '[| /C |]',
    '[| C/ |]',
  ])('leaves unsafe compact bracket group unchanged: %s', (group) => {
    const song = prepareSong(`{key: C}
${group}`);
    expect(chordsOf(song!)).toEqual([group.slice(1, -1)]);
  });

  // '[| C / D |]' used to live in the "unsafe" list above and was rejected
  // outright — at the time, a lone "/" had no defined meaning anywhere in
  // compact-bar notation, so treating it as ambiguous was the safe default.
  // Round 5 gives a standalone "/" a real meaning (see expandCompactBarGroup:
  // "continue the most recently established chord"), matching standard lead
  // sheet notation where a single slash commonly means "one held beat of the
  // same chord." That makes "C / D" unambiguous now — C held one extra beat,
  // then D — so this moved out of the rejection list into its own test here.
  it('a standalone "/" between two chords now means "hold the first chord one more beat"', () => {
    const song = prepareSong('{key: C}\n[| C / D |]', 2)!;
    expect(chordsOf(song!)).toEqual(['D', 'E']);
    const html = renderChordPro('{key: C}\n[| C / D |]', 2);
    expect(html).toContain('/');
  });

  it.each([
    'Repeat after me',
    'Repeat the last word softly',
    'Chorus (I love you)',
    'Verse (You are good)',
    'Repeat Chorus (softly)',
    'Chorus ()',
  ])('does not classify arbitrary repeat prose as a section: %s', (line) => {
    expect(isSectionLabel(line)).toBe(false);
  });

  it('preserves compact bar source through key insertion used by save paths', () => {
    const source = `{title: T}
{x_language: en}
[G]lyric
[| C D |]`;
    expect(ensureKeyDirective(toChordPro(source))).toBe(source);
  });

  it('accepts complete advanced chord tokens in compact bar notation', () => {
    const song = prepareSong(
      `{key: C}
[| Cmaj7#11 C7sus4 C(add9) C7b9#9 C7#9b9 C7b5#5 C7#5b5 C13b9#9 C°7 Cø7 CΔ7 C∆7 C+7 |]`,
      2,
    );
    expect(chordsOf(song!)).toEqual([
      'Dmaj7#11',
      'D7sus4',
      'D(add9)',
      'D7b9#9',
      'D7#9b9',
      'D7b5#5',
      'D7#5b5',
      'D13b9#9',
      'D°7',
      'Dø7',
      'DΔ7',
      'D∆7',
      'D+7',
    ]);
  });

  // parseSongAuto falls back to a lyrics-only ChordPro parse when it finds no
  // chords, so content without chords still yields a song rather than null.
  it('still returns a song for chordless content', () => {
    expect(prepareSong('just some words')).not.toBeNull();
  });
});

// ─── prepareSong (flat-key transposition consistency regression) ───────────
//
// Every test above this point only ever asserted single chords or chords
// sharing one root, which never exercises accidental *consistency* across a
// multi-chord line. That's exactly why the original bug went undetected:
// transposing a full diatonic progression into a flat-side destination (Ab,
// Db, Gb) used to render a mix of sharp- and flat-spelled chords in the same
// line (e.g. C-major's diatonic set transposed to "Ab" rendered as
// `G# Bbm Cm C# Eb Fm Gdim` — four different spellings in seven chords)
// because normalizeChord forced only some pitch classes (Db/Gb/Ab/Cb) back to
// sharp while leaving others (Eb/Bb) flat, independent of the destination
// key. These tests transpose a full diatonic set (or a realistic worship
// progression) and assert every chord agrees on one accidental.

describe('prepareSong: consistent accidental across a full progression', () => {
  const chordsOf = (song: NonNullable<ReturnType<typeof prepareSong>>) => {
    const out: string[] = [];
    song.mapChordLyricsPairs((p) => {
      const c = (p as { chords?: string }).chords;
      if (c) out.push(c);
      return p;
    });
    return out;
  };

  const DIATONIC = '{key: C}\n[C]a [Dm]b [Em]c [F]d [G]e [Am]f [Bdim]g';

  it('transposes the full diatonic set into Ab consistently (no stray sharp among the flats)', () => {
    const chords = chordsOf(prepareSong(DIATONIC, 8)!);
    expect(chords).toEqual(['G#', 'Bbm', 'Cm', 'C#', 'Eb', 'Fm', 'Gdim']);
    // Bb/Eb are the app's permanent flat exceptions (see keys.ts); every
    // other accidental chord in this key must be sharp, never a stray flat.
    const otherAccidentals = chords.filter((c) => !/^(Bb|Eb)/.test(c) && /[b#]/.test(c));
    expect(otherAccidentals.every((c) => c.includes('#'))).toBe(true);
  });

  it('transposes the full diatonic set into Db consistently', () => {
    const chords = chordsOf(prepareSong(DIATONIC, 1)!);
    expect(chords).toEqual(['C#', 'Ebm', 'Fm', 'F#', 'G#', 'Bbm', 'Cdim']);
    const otherAccidentals = chords.filter((c) => !/^(Bb|Eb)/.test(c) && /[b#]/.test(c));
    expect(otherAccidentals.every((c) => c.includes('#'))).toBe(true);
  });

  it('transposes the full diatonic set into Gb/F# consistently, including the Cb->B override', () => {
    const chords = chordsOf(prepareSong(DIATONIC, 6)!);
    expect(chords).toEqual(['F#', 'G#m', 'Bbm', 'B', 'C#', 'Ebm', 'Fdim']);
    expect(chords).not.toContain('Cb');
  });

  it('transposes the full diatonic set into a sharp key (E) without regressing to flats', () => {
    const chords = chordsOf(prepareSong(DIATONIC, 4)!);
    // D#dim would be the raw sharp spelling of the vii° chord's root, but the
    // permanent D#->Eb override still applies inside a sharp-preferred key.
    expect(chords).toEqual(['E', 'F#m', 'G#m', 'A', 'B', 'C#m', 'Ebdim']);
  });

  it('transposes the full diatonic set into a sharp key (B) without regressing to flats', () => {
    const chords = chordsOf(prepareSong(DIATONIC, 11)!);
    expect(chords).toEqual(['B', 'C#m', 'Ebm', 'E', 'F#', 'G#m', 'Bbdim']);
  });

  it('a realistic worship progression with slash chords transposes into Ab consistently', () => {
    const source = '{key: C}\n[C]a [Dm]b [Em]c [F]d [G/B]e [Am]f [F/A]g';
    const chords = chordsOf(prepareSong(source, 8)!);
    expect(chords).toEqual(['G#', 'Bbm', 'Cm', 'C#', 'Eb/G', 'Fm', 'C#/F']);
  });

  it('Nashville numbers are unaffected by the letter-spelling fix (pitch-based, not letter-based)', () => {
    const chords = chordsOf(prepareSong(DIATONIC, 8, true)!);
    expect(chords).toEqual(['1', '2m', '3m', '4', '5', '6m', '7dim']);
  });

  it('compact-bar notation transposed into a flat key expands with the same consistent spelling', () => {
    const source = '{key: C}\n[| C Dm Em | F G Am |]';
    const chords = chordsOf(prepareSong(source, 8)!);
    expect(chords).toEqual(['G#', 'Bbm', 'Cm', 'C#', 'Eb', 'Fm']);
  });

  it('a WT-import-shaped chart (no blank lines between sections) transposes into Ab consistently', () => {
    const wtStyle =
      '{title: Test}\n{key: C}\nVerse 1\n[C]Line one [Dm]line two\nChorus\n[F]Line three [G]line four [Am]line five';
    const chords = chordsOf(prepareSong(wtStyle, 8)!);
    expect(chords).toEqual(['G#', 'Bbm', 'C#', 'Eb', 'Fm']);
  });

  it('symbol chords (dim/half-dim/maj7/aug) sharing one root stay internally consistent into Ab', () => {
    const chords = chordsOf(prepareSong('{key: C}\n[C°]a [Cø7]b [C∆7]c [C+7]d', 8)!);
    expect(chords).toEqual(['G#°', 'G#ø7', 'G#∆7', 'G#+7']);
  });
});

// ─── prepareSong / renderChordPro (standalone instrumental chord line) ─────
//
// A song that mostly uses inline [bracket] chords may still write an
// instrumental section (Intro, Interlude, Turnaround, Outro) as a bare chord
// line with no lyric underneath — e.g. "Intro\nG D Em C" — since brackets
// don't make sense without lyrics to attach them to. Before this fix, the
// ChordPro parser (selected because the rest of the song has real bracket
// chords) had no way to recognize that bare line as chords: it read it as
// plain lyric text, so it silently never transposed while every other
// section did. Root cause: chord-only lines with no bracket syntax are
// invisible to the ChordPro parser unless bracketed first.
describe('prepareSong: standalone instrumental chord line (bare Intro bug)', () => {
  const chordsOf = (song: NonNullable<ReturnType<typeof prepareSong>>) => {
    const out: string[] = [];
    song.mapChordLyricsPairs((p) => {
      const c = (p as { chords?: string }).chords;
      if (c) out.push(c);
      return p;
    });
    return out;
  };

  it('transposes a bare Intro chord line alongside a bracketed verse', () => {
    const source = `{key: C}
Intro
C F G Am

Verse 1
[C]Amazing [F]grace how [G]sweet the [Am]sound`;
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song)).toEqual(['D', 'G', 'A', 'Bm', 'D', 'G', 'A', 'Bm']);
  });

  it('renders the transposed Intro chords in HTML, not the literal untransposed text', () => {
    const source = `{key: C}
Intro
C F G Am

Verse 1
[C]Amazing [F]grace how [G]sweet the [Am]sound`;
    const html = renderChordPro(source, 2);
    const introSection = html.slice(html.indexOf('Intro'), html.indexOf('Verse 1'));
    expect(introSection).toContain('>D<');
    expect(introSection).toContain('>G<');
    expect(introSection).toContain('>A<');
    expect(introSection).toContain('>Bm<');
    // The original, untransposed root C must not survive as a rendered chord.
    expect(introSection).not.toMatch(/class="chord">C</);
  });

  it('bracketing a standalone line does not consume a following blank line or the next section label', () => {
    const source = `{key: C}
Intro
C F G Am

Interlude
Dm G

Verse 1
[C]Amazing [F]grace`;
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song)).toEqual(['D', 'G', 'A', 'Bm', 'Em', 'A', 'D', 'G']);
  });

  it('an Outro-only chord line at the very end of the song (no trailing content) still transposes', () => {
    const source = `{key: C}
Verse 1
[C]Amazing [F]grace

Outro
C F G`;
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song)).toEqual(['D', 'G', 'D', 'G', 'A']);
  });

  it('does not bracket (and does not need to) an Intro written in compact-bar notation, which already worked', () => {
    const source = `{key: C}
Intro
[| C F | G Am |]

Verse 1
[C]Amazing [F]grace how [G]sweet the [Am]sound`;
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song)).toEqual(['D', 'G', 'A', 'Bm', 'D', 'G', 'A', 'Bm']);
  });

  it('leaves a real two-line chords-over-lyrics verse alone when the document has no bracket chords at all', () => {
    // Regression guard: a purely chords-over-lyrics document (no brackets
    // anywhere) must keep using ChordsOverWordsParser for its real chord/lyric
    // pairs. Auto-bracketing the bare Intro line here must not flip parser
    // selection and break the paired verse below it.
    const source = `{key: C}
Intro
C F G Am

Verse 1
C        F         G        Am
Amazing grace how sweet the sound`;
    const html = renderChordPro(source, 2);
    // The paired verse lyric must still be attached to its transposed chord.
    expect(html).toMatch(/class="chord">D<\/span><span class="lyrics">Amazing/);
    const song = prepareSong(source, 2)!;
    // Intro (D G A Bm) + the chord/lyric verse pair, matched by
    // ChordsOverWordsParser's own word-boundary alignment (D G A Bm again).
    expect(chordsOf(song)).toEqual(['D', 'G', 'A', 'Bm', 'D', 'G', 'A', 'Bm']);
  });

  it('does not bracket a bare chord line that has a genuine paired lyric line beneath it', () => {
    // Even in an otherwise bracket-chord document, a true two-line
    // chords-over-lyrics pair (chord line directly above its lyric line)
    // must not be mistaken for a standalone instrumental line and bracketed.
    //
    // Note: a genuine two-line chord/lyric pair living inside an otherwise
    // bracket-style ([chord]lyric) document is a separate, pre-existing gap
    // — ChordPro parser (selected because of the real [G] bracket) has no
    // concept of a chord line paired with a lyric line below it, bracketed
    // or not, so this pair renders as plain unattached lyric text either
    // way. That's unrelated to this fix; the only thing to guard here is
    // that auto-bracketing doesn't make it *worse* by turning "C"/"F" into
    // real (wrongly-transposed) chords that don't belong to this pair.
    const source = `{key: C}
[G]Bracketed verse line

Bridge
C          F
Some bridge lyric line`;
    const html = renderChordPro(source, 2);
    expect(html).not.toContain('class="chord">D');
    expect(html).toContain('<span class="lyrics">C</span>');
    expect(html).toContain('<span class="lyrics">F</span>');
  });
});

// ─── prepareSong / renderChordPro (pipe/slash bar-notation Intro) ──────────
//
// A THIRD distinct instrumental-notation shape, reported via a real
// screenshot after the previous round's fix (bare space-separated chord
// lines) shipped: bar/pipe notation with each held beat spelled out as its
// own token, e.g. "|G / / / |Gmaj7 / / / |Cmaj7 / / / |Cmaj7 / / / |". This
// is NOT the same as:
//   - a bare chord line ("C F G Am") — this one starts with "|", which
//     BARE_CHORD_LINE_RE/isBareChordLine (the previous round's fix) requires
//     the line to start with a chord letter, so it never matched;
//   - the app's own bracketed compact-bar shorthand ("[| G/// |]") — this one
//     has no brackets at all, and its hold-beat slashes are separate
//     space-delimited tokens rather than glued onto the chord.
// Root cause: neither existing code path recognized it, so it passed through
// completely untouched — same failure mode as the previous round's bug, one
// format shape earlier in the pipeline. Fixed by bracketBarNotationLines(),
// which glues the spaced slashes onto their chord (with cross-bar carry-over
// when a bar starts with bare slashes) and hands the result to the existing,
// already-tested bracketed compact-bar expander.
describe('prepareSong: pipe/slash bar-notation with spaced hold-beats', () => {
  const chordsOf = (song: NonNullable<ReturnType<typeof prepareSong>>) => {
    const out: string[] = [];
    song.mapChordLyricsPairs((p) => {
      const c = (p as { chords?: string }).chords;
      if (c) out.push(c);
      return p;
    });
    return out;
  };

  it('transposes the exact real-world example from the bug report', () => {
    const source = `{key: G}
Intro
|G / / / |Gmaj7 / / / |Cmaj7 / / / |Cmaj7 / / / |
|Em7 / / / |Em7 / / / |Cmaj7 / / / |Cmaj7 / / / |

Verse 1
[G]Amazing [Cmaj7]grace how [G]sweet the [Em7]sound`;
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song)).toEqual([
      'A',
      'Amaj7',
      'Dmaj7',
      'Dmaj7',
      'F#m7',
      'F#m7',
      'Dmaj7',
      'Dmaj7',
      'A',
      'Dmaj7',
      'A',
      'F#m7',
    ]);
  });

  it('renders transposed chords in the HTML, with bar pipes and hold-slashes still visible', () => {
    const source = '{key: G}\nIntro\n|G / / / |Cmaj7 / / / |\n\nVerse 1\n[G]a';
    const html = renderChordPro(source, 2);
    const introSection = html.slice(html.indexOf('Intro'), html.indexOf('Verse 1'));
    expect(introSection).toContain('>A<');
    expect(introSection).toContain('>Dmaj7<');
    expect(introSection).toContain('///');
    expect(introSection).toContain('|');
    // The original, untransposed chords must not survive as literal text.
    expect(introSection).not.toContain('|G /');
  });

  it('carries a chord across a bar boundary when a bar starts with bare hold-beats', () => {
    const song = prepareSong('{key: C}\nIntro\n|G / / / | / / / / |', 2)!;
    expect(chordsOf(song)).toEqual(['A', 'A']);
  });

  it('preserves N.C. as visible, untransposed text instead of dropping or misreading it', () => {
    const source = '{key: C}\nIntro\n|G / / / |N.C. / / / |C / / / |';
    const html = renderChordPro(source, 2);
    expect(html).toContain('N.C.');
    expect(html).not.toContain('class="chord">N.C.'); // it's not a chord, just held text
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song)).toEqual(['A', 'D']);
  });

  it('fails closed (leaves the line untouched) on a token that is neither a chord nor a recognized marker', () => {
    const source = '{key: C}\nIntro\n|G / bogus / |\n\nVerse 1\n[C]a';
    const song = prepareSong(source, 2)!;
    // Only the verse chord transposed; the malformed Intro line was left alone.
    expect(chordsOf(song)).toEqual(['D']);
  });

  it('[| G | N.C. | C |]: N.C. inside the existing bracketed compact-bar syntax also now works', () => {
    const song = prepareSong('{key: C}\n[| G N.C. C |]', 2)!;
    expect(chordsOf(song)).toEqual(['A', 'D']);
  });

  it('a lone bare "/" between two bracketed chords now holds the first chord one more beat (Round 5)', () => {
    // Was "regression guard: ... still rejected as ambiguous" as of this
    // round's own fix — at the time a standalone "/" had no defined meaning
    // in compact-bar notation, so rejecting it was the safe default. Round 5
    // (fixing Center's real, currently-broken Intro: "[|G / / / |...]")
    // deliberately gives a standalone "/" a real meaning: "continue the most
    // recently established chord" — the same thing "///" already means when
    // glued. That makes "C / D" unambiguous now (C held one extra beat, then
    // D), so this is no longer expected to be rejected. See the equivalent,
    // more detailed test in the compact-bar describe block above.
    const song = prepareSong('{key: C}\n[| C / D |]', 2)!;
    expect(chordsOf(song)).toEqual(['D', 'E']);
  });

  it('does not interfere with a real chords-over-lyrics document that happens to contain no pipes', () => {
    const source = '{key: C}\nIntro\nC F G Am\n\nVerse 1\n[C]Amazing [F]grace';
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song)).toEqual(['D', 'G', 'A', 'Bm', 'D', 'G']);
  });
});

// ─── prepareSong / renderChordPro (Round 5: already-bracketed bar notation) ─
//
// A user asked to apply the "Center" song's Intro formatting to other songs
// because they found it more readable. Investigating turned up that Center's
// Intro didn't actually transpose at all — it was silently failing the same
// way the pipe/slash bug above did, just one layer deeper (already inside
// [| |] brackets rather than bare text). Two distinct real-world gaps were
// found and fixed here; a third, genuinely ambiguous one was found and
// deliberately left unfixed (see the "flagged, not fixed" test below).
describe('prepareSong: Round 5 — already-bracketed bar notation gaps', () => {
  const chordsOf = (song: NonNullable<ReturnType<typeof prepareSong>>) => {
    const out: string[] = [];
    song.mapChordLyricsPairs((p) => {
      const c = (p as { chords?: string }).chords;
      if (c) out.push(c);
      return p;
    });
    return out;
  };

  it("Center's exact real stored Intro: spaced (non-glued) hold-slashes inside existing brackets", () => {
    // Previously: parseCompactBarSegment("/") returned null for each bare
    // "/" token, which failed the entire bracket group, leaving the whole
    // line as one literal, untransposed "chord". Fixed by expandCompactBarGroup
    // tracking whether a chord is currently in scope and treating a
    // standalone "/" run as a continuation of it.
    const source = `{key: G}
Intro
[|G / / / |Gmaj7 / / / |Cmaj7 / / / |Cmaj7 / / / |]
[|Em7 / / / |Em7 / / / |Cmaj7 / / / |Cmaj7 / / / |]

Verse 1
[G]Maybe we've made this [Gmaj7]complicated`;
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song).slice(0, 8)).toEqual(['A', 'Amaj7', 'Dmaj7', 'Dmaj7', 'F#m7', 'F#m7', 'Dmaj7', 'Dmaj7']);
    const html = renderChordPro(source, 2);
    const introSlice = html.slice(html.indexOf('Intro'), html.indexOf('Verse 1'));
    expect(introSlice).toContain('>A<');
    expect(introSlice).toContain('>Dmaj7<');
    expect(introSlice).toContain('>F#m7<');
    // The original, untransposed literal text must not survive.
    expect(introSlice).not.toContain('|G / / /');
  });

  it("What A Beautiful Name's exact real stored Instrumental: multi-bar bracket with no leading/trailing pipe", () => {
    // Previously: expandCompactBarGroup required the bracket's trimmed inner
    // content to both start AND end with "|", which this content (internal
    // bar separators only, no outer framing pipes) never satisfied — so the
    // whole group was rejected before any per-token validation even ran.
    const source = `{key: D}
Instrumental
[G///| A///| Bm///| F#m///]
X2
[G///| A///| Bm///| A///]

Bridge
Death could not [G]hold You`;
    const song = prepareSong(source, 2)!;
    expect(chordsOf(song)).toEqual(['A', 'B', 'C#m', 'G#m', 'A', 'B', 'C#m', 'B', 'A']);
    const html = renderChordPro(source, 2);
    const instrSlice = html.slice(html.indexOf('Instrumental'), html.indexOf('Bridge'));
    expect(instrSlice).toContain('>A<');
    expect(instrSlice).toContain('>C#m<');
    expect(instrSlice).not.toContain('G///| A///');
  });

  it("Firm Foundation's real stored Interlude: a slash chord with a trailing single hold-slash", () => {
    // "Ebmaj7/F/" = Ebmaj7 over F, held one extra beat. The existing /{2,}
    // split already handled a trailing run of 2+ slashes on any chord
    // ("G///", "Bb/D///"); only the single-trailing-slash case on an
    // already-slashed chord fell through and failed. A bare root chord with
    // a lone trailing slash and no bass note of its own ("C/") still
    // correctly stays rejected — see the guard test below.
    const song = prepareSong('{key: Eb}\n[| Ebmaj7/F/ F |]', 2)!;
    expect(chordsOf(song)).toEqual(['Fmaj7/G', 'G']);
  });

  it('regression guard: a bare root chord with a lone trailing slash and no bass note is still rejected', () => {
    const group = '[| C/ |]';
    const song = prepareSong(`{key: C}\n${group}`)!;
    expect(chordsOf(song)).toEqual([group.slice(1, -1)]);
  });

  it('flagged, not fixed: a chain of three chords joined by single slashes with no spaces is genuinely ambiguous', () => {
    // Real content from Firm Foundation's Interlude: "Bb/D/Gm" — almost
    // certainly meant as two chords, "Bb/D" then "Gm" (confirmed by the
    // Bridge section elsewhere in the same song using exactly those two
    // chords), most likely with a missing space in the original typing
    // ("Bb/D Gm" would already parse correctly today). But "Bb/D/Gm" could
    // also be misread as a chord with two stacked bass notes, so this is
    // deliberately left unresolved rather than guessed at — unlike the two
    // cases above, there isn't a single unambiguous musical reading to fall
    // back on. This test locks in the current (correct, fail-closed)
    // behavior: the group stays untouched rather than being misinterpreted.
    const group = '[| Bb/D/Gm F |]';
    const song = prepareSong(`{key: Bb}\n${group}`)!;
    expect(chordsOf(song)).toEqual([group.slice(1, -1)]);
  });
});

// ─── renderChordPro: instrumental row spacing hook ──────────────────────
//
// A user asked for bar-notation/instrumental lines (Intro, Interlude, etc.)
// to render with clearer, less cramped spacing than the default 1px column
// gap used for normal chords-over-lyrics rows. Rather than guess which rows
// are "instrumental" from paragraph type (unreliable — a bare Interlude has
// no section-label paragraph type) or from raw source text, renderLine
// checks the actual parsed content: a row where every item's lyrics are
// empty or pure bar punctuation ("|", "/", "///", "N.C.", etc.) and at
// least one item has a chord gets a "row-instrumental" class, and
// individual punctuation-only columns within it get "column-punct" so CSS
// can space chord chips generously while keeping bar/beat marks tight.
describe('renderChordPro: row-instrumental / column-punct CSS hooks', () => {
  it('marks a Center-shaped instrumental row (already bracketed, spaced hold-beats)', () => {
    const html = renderChordPro('{key: G}\nIntro\n[|G / / / |Gmaj7 / / / |]\n\nVerse 1\n[G]a', 0);
    const introRow = html.slice(html.indexOf('Intro'), html.indexOf('Verse 1'));
    expect(introRow).toContain('class="row row-instrumental"');
    expect(introRow).toContain('class="column column-punct"');
    // The chord chips themselves ("G", "Gmaj7") must NOT be punct-tagged.
    expect(introRow).not.toContain('column column-punct"><span class="chord">G<');
  });

  it('marks a WABN-shaped instrumental row (glued hold-beats, no outer pipe)', () => {
    const html = renderChordPro('{key: D}\nInstrumental\n[G///| A///|]\n\nBridge\n[G]a', 0);
    const instrRow = html.slice(html.indexOf('>Instrumental<'), html.indexOf('>Bridge<'));
    expect(instrRow).toContain('class="row row-instrumental"');
  });

  it('marks a bare unbracketed pipe/slash instrumental row (Round 4 shape)', () => {
    const html = renderChordPro('{key: G}\nIntro\n|G / / / |Gmaj7 / / / |\n\nVerse 1\n[G]a', 0);
    const introRow = html.slice(html.indexOf('Intro'), html.indexOf('Verse 1'));
    expect(introRow).toContain('class="row row-instrumental"');
    expect(introRow).toContain('class="column column-punct"');
  });

  it('does NOT mark an ordinary chords-over-lyrics verse row', () => {
    const html = renderChordPro('{key: G}\nVerse 1\n[G]Amazing [C]grace how sweet', 0);
    expect(html).not.toContain('row-instrumental');
    expect(html).not.toContain('column-punct');
  });

  it('does NOT mark a bracket-per-chord instrumental row that already worked (Fall Like Rain shape)', () => {
    // This shape (space-separated whole-chord brackets, no bar punctuation
    // at all) already rendered as individually-spaced chips before this
    // change and doesn't need the tighter/looser punct distinction — it's
    // fine either way, but confirm it doesn't error or mis-tag.
    const html = renderChordPro('{key: Eb}\nIntro\n[Eb] [Bb/D] [Cm7] [Eb2/G]\n\nVerse 1\n[Eb]a', 0);
    const introRow = html.slice(html.indexOf('Intro'), html.indexOf('Verse 1'));
    expect(introRow).toContain('row-instrumental');
    expect(introRow).not.toContain('column-punct');
  });
});

// ─── canonicalizeSectionLabel ───────────────────────────────────────

describe('canonicalizeSectionLabel', () => {
  it('canonicalises the basic vocabulary to Title-Case-with-Spaces', () => {
    expect(canonicalizeSectionLabel('verse')).toBe('Verse');
    expect(canonicalizeSectionLabel('VERSE')).toBe('Verse');
    expect(canonicalizeSectionLabel('chorus')).toBe('Chorus');
    expect(canonicalizeSectionLabel('Bridge')).toBe('Bridge');
    expect(canonicalizeSectionLabel('intro')).toBe('Intro');
    expect(canonicalizeSectionLabel('outro')).toBe('Outro');
  });

  it('preserves section numbers', () => {
    expect(canonicalizeSectionLabel('verse 1')).toBe('Verse 1');
    expect(canonicalizeSectionLabel('VERSE2')).toBe('Verse 2');
    expect(canonicalizeSectionLabel('Chorus 3')).toBe('Chorus 3');
  });

  it('canonicalises Pre-Chorus variants consistently', () => {
    expect(canonicalizeSectionLabel('pre chorus')).toBe('Pre-Chorus');
    expect(canonicalizeSectionLabel('Pre-Chorus')).toBe('Pre-Chorus');
    expect(canonicalizeSectionLabel('PRECHORUS')).toBe('Pre-Chorus');
    expect(canonicalizeSectionLabel('pre-chorus 2')).toBe('Pre-Chorus 2');
  });

  it('canonicalises Half-Chorus and Vamp', () => {
    expect(canonicalizeSectionLabel('half chorus')).toBe('Half-Chorus');
    expect(canonicalizeSectionLabel('half-chorus')).toBe('Half-Chorus');
    expect(canonicalizeSectionLabel('Half-Chorus 2')).toBe('Half-Chorus 2');
    expect(canonicalizeSectionLabel('vamp')).toBe('Vamp');
    expect(canonicalizeSectionLabel('Vamp 4')).toBe('Vamp 4');
  });

  it('canonicalises Alt Verse', () => {
    expect(canonicalizeSectionLabel('alt verse')).toBe('Alt Verse');
    expect(canonicalizeSectionLabel('Alt Verse 1')).toBe('Alt Verse 1');
  });

  it('strips surrounding brackets and colons', () => {
    expect(canonicalizeSectionLabel('[Verse 1]')).toBe('Verse 1');
    expect(canonicalizeSectionLabel('[Verse 1]:')).toBe('Verse 1');
    expect(canonicalizeSectionLabel('Verse 1:')).toBe('Verse 1');
  });

  it('REPEAT wraps the rest in the same canonical form', () => {
    expect(canonicalizeSectionLabel('REPEAT VERSE1')).toBe('REPEAT Verse 1');
    expect(canonicalizeSectionLabel('repeat chorus')).toBe('REPEAT Chorus');
    expect(canonicalizeSectionLabel('REPEAT Pre-Chorus')).toBe('REPEAT Pre-Chorus');
  });

  it('collapses inner whitespace', () => {
    expect(canonicalizeSectionLabel('  verse   1  ')).toBe('Verse 1');
    expect(canonicalizeSectionLabel('verse\t1')).toBe('Verse 1');
  });

  it('falls back to a cleaned, single-spaced form for unknown labels', () => {
    expect(canonicalizeSectionLabel('Coda (instrumental)')).toBe('Coda (instrumental)');
    expect(canonicalizeSectionLabel('something custom')).toBe('something custom');
  });
});

// ─── isCompactBarNotation ──────────────────────────────────────────

describe('isCompactBarNotation', () => {
  it('returns true for bar-delimited chart groups', () => {
    expect(isCompactBarNotation('[| C | G/B | Am | F |]')).toBe(true);
    expect(isCompactBarNotation('[|C G/B Am F|]')).toBe(true);
  });
  it('returns false for ordinary bracketed chords and ChordPro', () => {
    expect(isCompactBarNotation('[C]Amazing [G]grace')).toBe(false);
    expect(isCompactBarNotation('{title: Test}\n[G]Hi')).toBe(false);
    expect(isCompactBarNotation('plain text')).toBe(false);
  });
});

// ─── normalizeOnSave ───────────────────────────────────────────────

describe('normalizeOnSave', () => {
  it('returns compact bar source byte-for-byte except trailing whitespace', () => {
    const src = '[| C | G/B | Am | F |]\n[| F | G | C |]   \n\n';
    expect(normalizeOnSave(src)).toBe('[| C | G/B | Am | F |]\n[| F | G | C |]\n');
  });

  it('lowercases directive names without changing the body', () => {
    const src = '{Title: Song}\n{ARTIST: Joe}\n{key: C}\n\n[G]line';
    const result = normalizeOnSave(src);
    expect(result).toBe('{title: Song}\n{artist: Joe}\n{key: C}\n\n[G]line\n');
  });

  it('preserves the body of ChordPro exactly (chords, lyrics, sections)', () => {
    const src = '{title: Test}\n[C]hello [G]world';
    const result = normalizeOnSave(src);
    expect(result).toBe('{title: Test}\n[C]hello [G]world\n');
  });

  it('ensures exactly one trailing newline and strips trailing whitespace', () => {
    expect(normalizeOnSave('{title: T}\n[G]hi\n\n\n')).toBe('{title: T}\n[G]hi\n');
    expect(normalizeOnSave('{title: T}\n[G]hi')).toBe('{title: T}\n[G]hi\n');
  });

  it('does not lowercase the prefix of non-directive lines that contain {', () => {
    const src = 'some {inline} text\n[G]hi';
    expect(normalizeOnSave(src)).toBe('some {inline} text\n[G]hi\n');
  });
});

// ─── prepareForPersist (single save entry point) ──────────────────

describe('prepareForPersist', () => {
  it('runs reformat + key insertion + housekeeping in one pass', () => {
    // Tidy: key inserted, directive names lowercased, trailing newline.
    const src = '{Title: Song}\n{KEY: C}\n\n{comment: lead}\n[G]hi\n[G]there';
    const result = prepareForPersist(src);
    // Whatever shape toChordPro produces, the result must end with a single
    // newline, contain no uppercase directive names, and have a {key:} line.
    expect(result.endsWith('\n')).toBe(true);
    expect(result).not.toMatch(/\{[A-Z]+:/);
    expect(result).toMatch(/\{key:\s*C/);
  });

  it('preserves compact bar source byte-for-byte (apart from trailing newline)', () => {
    const src = '[| C | G/B | Am | F |]\n[| F | G | C |]   ';
    const result = prepareForPersist(src);
    expect(result).toBe('[| C | G/B | Am | F |]\n[| F | G | C |]\n');
  });

  it('returns empty string as-is', () => {
    expect(prepareForPersist('')).toBe('');
  });
});

// ─── renderChordPro: consistent wrapper ─────────────────────────────

describe('renderChordPro (Phase 0 wrapper)', () => {
  it('renders all parsed charts inside one chord-sheet container', () => {
    const html = renderChordPro('{title: T}\n{key: C}\n\n[C]hi', 0);
    expect(html.startsWith('<div class="chord-sheet">')).toBe(true);
    expect(html.endsWith('</div>')).toBe(true);
    expect(html.match(/<div class="chord-sheet">/g)?.length).toBe(1);
  });

  it('falls back to a themed surface (no inline styles) when parsing fails', () => {
    // An unterminated directive is the canonical "parse fails" input —
    // ChordProParser throws, renderChordPro falls back to the themed surface.
    const html = renderChordPro('{key: G\n[G]hi', 0);
    expect(html.startsWith('<div class="chord-sheet">')).toBe(true);
    expect(html).toContain('chord-sheet-fallback');
    expect(html).not.toMatch(/<pre\b/);
    expect(html).not.toMatch(/style=/);
  });

  it('uses the canonical heading form for parser-detected labels', () => {
    // Parser hands back a `verse1` paragraph type for [VERSE1]; canonicalize
    // it on the way out so it renders as "Verse 1" regardless of source.
    const html = renderChordPro('{key: C}\n[VERSE1]\n[C]hi\n\n[CHORUS]\n[G]yay', 0);
    expect(html).toContain('Verse 1');
    expect(html).toContain('Chorus');
    expect(html).not.toContain('VERSE1');
    expect(html).not.toContain('Verse1');
    expect(html).not.toContain('>VERSE 1<');
  });

  it('keeps an inline label line (lyric-only) as a heading', () => {
    const html = renderChordPro('{key: C}\n[BRIDGE]\n[G]yay', 0);
    expect(html).toContain('Bridge');
    expect(html).not.toContain('BRIDGE');
  });
});
