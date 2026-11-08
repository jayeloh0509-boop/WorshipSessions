import { describe, expect, it } from 'vitest';
import { clampTempo, diagramShape, extractChordNames, simplifyChordName, simplifyChordPro } from '../musician-tools';

describe('musician tools', () => {
  it('simplifies extended chords without changing roots or slash bass notes', () => {
    expect(simplifyChordName('Cmaj7')).toBe('C');
    expect(simplifyChordName('F#m7/C#')).toBe('F#m/C#');
    expect(simplifyChordName('A/C#')).toBe('A/C#');
    expect(simplifyChordName('Bbmaj9')).toBe('Bb');
    expect(simplifyChordName('N.C.')).toBe('N.C.');
    expect(simplifyChordPro('[Cmaj7]Love [F#m7/C#]You')).toBe('[C]Love [F#m/C#]You');
  });

  it('does not simplify bracketed section labels or non-chord content', () => {
    expect(simplifyChordPro('[Alt Verse 1]\n[A Cappella]\n[Cmaj7]Love')).toBe('[Alt Verse 1]\n[A Cappella]\n[C]Love');
  });

  it('preserves minor quality aliases', () => {
    expect(simplifyChordName('Cmin7')).toBe('Cm');
    expect(simplifyChordName('Dminor/F')).toBe('Dm/F');
  });

  it('extracts unique chord names in song order', () => {
    expect(extractChordNames('[C]One [G]two\n[C]three [Am7]four')).toEqual(['C', 'G', 'Am7']);
  });

  it('never shows a different chord\'s diagram under the original label', () => {
    expect(diagramShape('Cmaj7')?.frets).toEqual(['x', 3, 2, 0, 0, 0]);
    expect(diagramShape('CM7')?.frets).toEqual(['x', 3, 2, 0, 0, 0]);
    expect(diagramShape('Am7')?.frets).toEqual(['x', 0, 2, 0, 1, 0]);
    expect(diagramShape('G7')?.frets).toEqual([3, 2, 0, 0, 0, 1]);
    expect(diagramShape('Bdim')).toBeNull();
    expect(diagramShape('Caug')).toBeNull();
    expect(diagramShape('Cmaj9')).toBeNull();
    expect(diagramShape('F#m7')).toBeNull();
    expect(diagramShape('N.C.')).toBeNull();
  });

  it('provides common guitar shapes and safe tempo bounds', () => {
    expect(diagramShape('C')?.frets).toEqual(['x', 3, 2, 0, 1, 0]);
    expect(diagramShape('Cmin')?.frets).toEqual(diagramShape('Cm')?.frets);
    expect(diagramShape('C/G')?.frets).toEqual(diagramShape('C')?.frets);
    expect(clampTempo(5)).toBe(30);
    expect(clampTempo(999)).toBe(240);
  });
});
