import {
  extractDirective,
  updateDirective,
  toChordPro,
  ensureKeyDirective,
  detectFormat,
  getSongKey,
  isSectionLabel,
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

  it.each(['Half-Chorus', 'Vamp', 'Alt Verse 1', 'REPEAT VERSE 1'])('recognizes imported section label %s', (label) => {
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

  it('transposes compact bracketed bar notation as individual chords', () => {
    const source = `{key: Bb}
[| Bb//Bb Cm7 Bb/D | Eb2///|]`;
    const song = prepareSong(source, 2);

    expect(chordsOf(song!)).toEqual(['C', 'C', 'Dm7', 'C/E', 'F2']);
    expect(source).toBe(`{key: Bb}
[| Bb//Bb Cm7 Bb/D | Eb2///|]`);
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

    expect(chordsOf(prepareSong(source, 2, true)!)).toEqual([
      '1°',
      '1°7/4',
      '1ø7/#5',
      '1Δ7/4',
      '1∆/#5',
      '1+7/4',
    ]);
    expect(chordsOf(prepareSong(source, -2, true)!)).toEqual([
      '1°',
      '1°7/4',
      '1ø7/b6',
      '1Δ7/4',
      '1∆/b6',
      '1+7/4',
    ]);
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
    '[| C / D |]',
    '[| /C |]',
    '[| C/ |]',
  ])('leaves unsafe compact bracket group unchanged: %s', (group) => {
    const song = prepareSong(`{key: C}
${group}`);
    expect(chordsOf(song!)).toEqual([group.slice(1, -1)]);
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
