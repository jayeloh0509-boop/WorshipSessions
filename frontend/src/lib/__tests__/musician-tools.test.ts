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

  it('extracts unique chord names in song order', () => {
    expect(extractChordNames('[C]One [G]two\n[C]three [Am7]four')).toEqual(['C', 'G', 'Am7']);
  });

  it('provides common guitar shapes and safe tempo bounds', () => {
    expect(diagramShape('Cmaj7')?.frets).toEqual(['x', 3, 2, 0, 1, 0]);
    expect(clampTempo(5)).toBe(30);
    expect(clampTempo(999)).toBe(240);
  });
});
