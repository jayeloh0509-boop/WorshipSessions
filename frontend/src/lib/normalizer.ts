export interface NormalizationChange {
  line: number;
  from: string;
  to: string;
}

const CANONICAL: Record<string, string> = {
  intro: 'Intro', introduction: 'Intro', verse: 'Verse', v: 'Verse', 'alt verse': 'Alt Verse', 'alternate verse': 'Alt Verse',
  'pre-chorus': 'Pre-Chorus', prechorus: 'Pre-Chorus', chorus: 'Chorus', refrain: 'Chorus', 'half-chorus': 'Half-Chorus',
  bridge: 'Bridge', interlude: 'Interlude', instrumental: 'Instrumental', vamp: 'Vamp', tag: 'Tag', outro: 'Outro', ending: 'Ending',
};
const ALLOWED = new Set(['Intro','Verse','Alt Verse','Pre-Chorus','Chorus','Half-Chorus','Bridge','Interlude','Instrumental','Vamp','Tag','Outro','Ending']);

/** Propose only unambiguous explicit section-label/directive changes. Lyrics and spacing are never touched. */
export function proposeNormalization(source: string) {
  const changes: NormalizationChange[] = [];
  const lines = source.split(/(\r\n|\n|\r)/);
  let line = 1;
  for (let i = 0; i < lines.length; i += 2) {
    const text = lines[i];
    const match = text.match(/^(\s*\{\s*(?:comment|c|section)\s*:\s*)([^}]+?)(\s*\}\s*)$/i) || text.match(/^(\s*\[\s*)([^\]]+?)(\s*\]\s*)$/);
    if (match) {
      const raw = match[2].trim();
      const repeat = raw.match(/^(.*?)(?:\s+(?:x|×)\s*\d+)$/i);
      const base = (repeat ? repeat[1] : raw).trim();
      const canonical = CANONICAL[base.toLowerCase()];
      if (canonical && !ALLOWED.has(raw)) {
        const replacement = canonical + (repeat ? raw.slice(base.length) : '');
        const next = text.slice(0, match.index! + match[1].length) + replacement + text.slice(match.index! + match[1].length + match[2].length);
        changes.push({ line, from: text, to: next });
        lines[i] = next;
      }
    }
    line++;
  }
  return { proposed: lines.join(''), changes };
}
