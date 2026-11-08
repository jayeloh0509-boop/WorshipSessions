const CHORD_TOKEN = /\[([^\]]+)\]/g;
const CHORD_NAME =
  /^[A-G](?:#|b)?(?:(?:m|min|minor|maj|dim|aug|sus|add|no|°|ø|Δ|∆|\+)?[\d#b()+°øΔ∆-]*)?(?:\/[A-G](?:#|b)?)?$/i;

function isChordName(value: string): boolean {
  return CHORD_NAME.test(value.trim());
}

export function simplifyChordName(chord: string): string {
  const trimmed = chord.trim();
  if (!isChordName(trimmed) || /^(N\.C\.|NC)$/i.test(trimmed)) return chord;
  return trimmed
    .split('/')
    .map((part, index) => {
      const match = part.trim().match(/^([A-G](?:#|b)?)(.*)$/);
      if (!match) return part.trim();
      if (index > 0) return match[1];
      const quality = match[2];
      return `${match[1]}${/^(?:m(?!aj)|min|minor)/i.test(quality) ? 'm' : ''}`;
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
  C7: { frets: ['x', 3, 2, 3, 1, 0] },
  D7: { frets: ['x', 'x', 0, 2, 1, 2] },
  E7: { frets: [0, 2, 0, 1, 0, 0] },
  G7: { frets: [3, 2, 0, 0, 0, 1] },
  A7: { frets: ['x', 0, 2, 0, 2, 0] },
  B7: { frets: ['x', 2, 1, 2, 0, 2] },
  Am7: { frets: ['x', 0, 2, 0, 1, 0] },
  Dm7: { frets: ['x', 'x', 0, 2, 1, 1] },
  Em7: { frets: [0, 2, 0, 0, 0, 0] },
  Cmaj7: { frets: ['x', 3, 2, 0, 0, 0] },
  Fmaj7: { frets: ['x', 'x', 3, 2, 1, 0] },
  Gmaj7: { frets: [3, 2, 0, 0, 0, 2] },
  Dsus2: { frets: ['x', 'x', 0, 2, 3, 0] },
  Dsus4: { frets: ['x', 'x', 0, 2, 3, 3] },
  Asus2: { frets: ['x', 0, 2, 2, 0, 0] },
  Asus4: { frets: ['x', 0, 2, 2, 3, 0] },
  Esus4: { frets: [0, 2, 2, 2, 0, 0] },
};

// Only return a diagram when the chord's actual quality has a verified shape.
// Falling back to a simplified chord (e.g. Bdim -> B, Caug -> C) would show a
// different chord under the original label, so unknown qualities return null.
export function diagramShape(chord: string): GuitarShape | null {
  const trimmed = chord.trim();
  if (!isChordName(trimmed)) return null;
  const match = trimmed.split('/')[0].match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return null;
  const [, root, rawQuality] = match;
  let quality = rawQuality;
  if (/^(?:m|min|minor|-)$/.test(quality)) quality = 'm';
  else if (/^(?:m7|min7|minor7|-7)$/.test(quality)) quality = 'm7';
  else if (/^(?:maj7|M7|Maj7|Δ7|∆7|Δ|∆)$/.test(quality)) quality = 'maj7';
  return GUITAR_SHAPES[`${root}${quality}`] || null;
}

export function clampTempo(value: number): number {
  return Math.min(240, Math.max(30, Math.round(value || 0)));
}
