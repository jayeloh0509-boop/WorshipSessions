const CHORD_TOKEN = /\[([^\]]+)\]/g;

export function simplifyChordName(chord: string): string {
  if (/^(N\.C\.|NC)$/i.test(chord.trim())) return chord;
  return chord
    .split('/')
    .map((part, index) => {
      const match = part.trim().match(/^([A-G](?:#|b)?)(.*)$/);
      if (!match) return part.trim();
      if (index > 0) return match[1];
      const quality = match[2];
      return `${match[1]}${/^m(?!aj)/i.test(quality) ? 'm' : ''}`;
    })
    .join('/');
}

export function simplifyChordPro(content: string): string {
  return content.replace(CHORD_TOKEN, (_full, chord: string) => `[${simplifyChordName(chord)}]`);
}

export function extractChordNames(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(CHORD_TOKEN)) {
    const chord = match[1].trim();
    if (/^[A-G](?:#|b)?/.test(chord)) names.add(chord);
  }
  return [...names];
}

export interface GuitarShape {
  frets: Array<number | 'x'>;
  fingers?: number[];
}

export const GUITAR_SHAPES: Record<string, GuitarShape> = {
  C: { frets: ['x', 3, 2, 0, 1, 0] },
  D: { frets: ['x', 'x', 0, 2, 3, 2] },
  E: { frets: [0, 2, 2, 1, 0, 0] },
  F: { frets: [1, 3, 3, 2, 1, 1] },
  G: { frets: [3, 2, 0, 0, 0, 3] },
  A: { frets: ['x', 0, 2, 2, 2, 0] },
  B: { frets: ['x', 2, 4, 4, 4, 2] },
  Am: { frets: ['x', 0, 2, 2, 1, 0] },
  Bm: { frets: ['x', 2, 4, 4, 3, 2] },
  Cm: { frets: ['x', 3, 5, 5, 4, 3] },
  Dm: { frets: ['x', 'x', 0, 2, 3, 1] },
  Em: { frets: [0, 2, 2, 0, 0, 0] },
  Fm: { frets: [1, 3, 3, 1, 1, 1] },
  Gm: { frets: [3, 5, 5, 3, 3, 3] },
};

export function diagramShape(chord: string): GuitarShape | null {
  const simple = simplifyChordName(chord).split('/')[0];
  return GUITAR_SHAPES[simple] || null;
}

export function clampTempo(value: number): number {
  return Math.min(240, Math.max(30, Math.round(value || 0)));
}
