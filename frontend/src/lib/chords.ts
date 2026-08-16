import * as ChordSheetJS from 'chordsheetjs';
import { escHtml } from './util';
import { normalizeKey, normalizeChord } from './keys';
import type { SetlistEntry, SetlistPreferences } from '../types';

const PARSER_NAMES = [
  { cls: 'ChordProParser', label: 'ChordPro' },
  { cls: 'UltimateGuitarParser', label: 'Ultimate Guitar' },
  { cls: 'ChordsOverWordsParser', label: 'Chords over lyrics' },
] as const;

const DIRECTIVE_RE = /^\{([a-z_]+):\s*([^}]*)\}$/i;
const DIRECTIVE_LINE_RE = /^\{[a-z_]+:.*\}$/i;
const DIRECTIVE_ORDER = ['title', 'artist', 'key', 'tempo', 'capo', 'x_youtube', 'x_tags', 'x_language'];

const SECTION_NAMES =
  'Verse|Chorus|Bridge|Intro|Outro|Interlude|Pre[- ]?Chorus|Ending|Tag|Coda|Break|Solo|Instrumental|Refrain|Vamp';
const SECTION_BASE = String.raw`(?:Half[- ]?Chorus|Alt\s+Verse|${SECTION_NAMES})`;
const SECTION_ANNOTATION = String.raw`(?:down|up|quiet|soft|loud|build|full|all\s+in|a\s+cappella|acapella|instrumental|\d+\s*(?:bars?|times?|x)|x\s*\d+)`;
const SECTION_VARIANT = String.raw`${SECTION_BASE}(?:\s*\d+)?(?:\s*\(${SECTION_ANNOTATION}\))?`;
const REPEAT_SECTION_VARIANT = String.raw`REPEAT\s+${SECTION_BASE}(?:\s+\d+)?(?:\s*(?:X\s*\d+|\d+\s*X))?(?:\s*\(${SECTION_ANNOTATION}\))?`;
// Matches vocabulary-driven section labels only. Ordinary lyric or instruction
// prose beginning with "Repeat" must not become a section or roadmap item.
const SECTION_LABEL_RE = new RegExp(
  String.raw`^\[?(?:${SECTION_VARIANT}|${REPEAT_SECTION_VARIANT}|FINAL\s+CHORD)\s*:?\]?$`,
  'i',
);

export function isSectionLabel(value: string): boolean {
  return SECTION_LABEL_RE.test(value.trim());
}

export function extractDirective(content: string, name: string): string | null {
  const re = new RegExp(`^\\{${name}:\\s*([^}]*)\\}`, 'im');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

export function updateDirective(content: string, name: string, value: string | null): string {
  const re = new RegExp(`^\\{${name}:.*\\}[ \\t]*$`, 'im');
  if (!value || !value.trim()) {
    // Remove directive line (and trailing newline if present)
    return content.replace(new RegExp(`^\\{${name}:.*\\}[ \\t]*\\n?`, 'im'), '');
  }
  const newLine = `{${name}: ${value.trim()}}`;
  if (re.test(content)) {
    return content.replace(re, newLine);
  }
  // Insert at correct position among directives at top of file
  const lines = content.split('\n');
  const targetIdx = DIRECTIVE_ORDER.indexOf(name);
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(DIRECTIVE_RE);
    if (dm) {
      const existingIdx = DIRECTIVE_ORDER.indexOf(dm[1].toLowerCase());
      if (existingIdx < targetIdx || (existingIdx === -1 && targetIdx === -1)) {
        insertAt = i + 1;
      }
    } else if (DIRECTIVE_LINE_RE.test(lines[i])) {
      insertAt = i + 1;
    } else {
      break;
    }
  }
  lines.splice(insertAt, 0, newLine);
  return lines.join('\n');
}

// Some imports (e.g. Worship Together downloads) run every section together
// with no blank lines at all, so the whole chart parses as one unbreakable
// paragraph — two-column layout has nothing to break on and crams the song
// into a single narrow column while the other sits empty. Insert a blank
// line before each section label when one isn't already there, so a
// paragraph break exists at every section boundary regardless of source
// formatting.
const COMPACT_BAR_ROOT = String.raw`[A-G](?:#|b)?`;
const COMPACT_BAR_EXTENSION = String.raw`(?:2|4|5|6|7|9|11|13)`;
const COMPACT_BAR_DECORATION = String.raw`(?:sus[24]|add(?:2|4|6|9|11|13)|no(?:3|5)|[#b](?:5|9|11|13))`;
const COMPACT_BAR_SUFFIX_RE = new RegExp(
  String.raw`^(?:(?:maj|min|m|dim|aug)?${COMPACT_BAR_EXTENSION}?|[°ø∆Δ+]${COMPACT_BAR_EXTENSION}?|sus[24]|add(?:2|4|6|9|11|13)|\((?:add|no|sus)?[#b]?(?:2|3|4|5|6|9|11|13)\))(?:${COMPACT_BAR_DECORATION})*$`,
);
const COMPACT_BAR_CHORD_RE = new RegExp(String.raw`^(${COMPACT_BAR_ROOT})([^/]*)(?:\/(${COMPACT_BAR_ROOT}))?$`);

function isCompactBarChord(token: string): boolean {
  const match = token.match(COMPACT_BAR_CHORD_RE);
  if (!match || !COMPACT_BAR_SUFFIX_RE.test(match[2])) return false;

  const decorations = match[2].match(new RegExp(COMPACT_BAR_DECORATION, 'g')) ?? [];
  const normalized = decorations.map((part) => part.toLowerCase());
  if (new Set(normalized).size !== normalized.length) return false;
  if (normalized.filter((part) => part.startsWith('sus')).length > 1) return false;

  const susIntervals = new Set(
    normalized.filter((part) => part.startsWith('sus')).map((part) => part.slice(3)),
  );
  const addIntervals = normalized
    .filter((part) => part.startsWith('add'))
    .map((part) => part.slice(3));
  if (addIntervals.some((interval) => susIntervals.has(interval))) return false;

  const decoratedIntervals = normalized.map((part) => part.match(/\d+$/)?.[0]).filter(Boolean);
  const baseExtension = match[2].match(/^(?:maj|min|m|dim|aug)?(2|4|5|6|7|9|11|13)/)?.[1];
  if (baseExtension && decoratedIntervals.includes(baseExtension)) return false;
  return true;
}

function parseCompactBarSegment(segment: string): string | null {
  const parts = segment.split(/(\/{2,})/);
  if (parts.length === 1) return isCompactBarChord(segment) ? `[${segment}]` : null;
  if (!parts[0] || !isCompactBarChord(parts[0])) return null;

  let output = `[${parts[0]}]`;
  for (let index = 1; index < parts.length; index += 2) {
    const separator = parts[index];
    const nextChord = parts[index + 1] ?? '';
    output += separator;
    if (!nextChord) {
      if (index !== parts.length - 2) return null;
      continue;
    }
    if (!isCompactBarChord(nextChord)) return null;
    output += `[${nextChord}]`;
  }
  return output;
}

// Expand only a complete, validated compact-bar group. Anything that is not
// bounded by outer barlines or contains an unsupported token is returned
// verbatim, preventing bracketed prose and malformed annotations from being
// silently reinterpreted as chords.
function expandCompactBarGroup(inner: string): string | null {
  const trimmed = inner.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;

  let output = '';
  let cursor = 0;
  while (cursor < inner.length) {
    if (/\s|\|/.test(inner[cursor])) {
      output += inner[cursor];
      cursor += 1;
      continue;
    }

    let end = cursor;
    while (end < inner.length && !/\s|\|/.test(inner[end])) end += 1;
    const expanded = parseCompactBarSegment(inner.slice(cursor, end));
    if (expanded === null) return null;
    output += expanded;
    cursor = end;
  }
  return output;
}

function expandCompactBarNotation(text: string): string {
  return text.replace(/\[([^\]\n]*\|[^\]\n]*)\]/g, (match, inner: string) => expandCompactBarGroup(inner) ?? match);
}

function ensureSectionParagraphBreaks(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (out.length > 0 && out[out.length - 1].trim() !== '' && SECTION_LABEL_RE.test(line.trim())) {
      out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

export function parseSongAutoWithFormat(rawContent: string): { song: ChordSheetJS.Song; format: string | null } | null {
  // Pre-process content: force all chords to preferred enharmonic spellings (Sharps)
  // and fix spacing issues in slash chords (e.g. [A / C#] -> [A/C#]) BEFORE parsing.
  // This ensures transpose and Nashville work correctly.
  let content = expandCompactBarNotation(rawContent).replace(/\[([^\]]+)\]/g, (match, inner) => {
    // Rejected outer compact-bar groups are fail-closed source. Do not let the
    // generic slash normalizer mutate or reinterpret them after validation.
    const trimmed = inner.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) return match;

    // 1. Fix spaces around slashes
    const cleaned = inner.replace(/\s*\/\s*/g, '/');
    // Preserve the source chart's written enharmonic spelling.
    return `[${cleaned}]`;
  });

  content = ensureSectionParagraphBreaks(content);

  // Also normalize Chords-over-lyrics format (lines with only chords)
  content = content
    .split('\n')
    .map((line) => {
      const isChordLine = /^\s*[A-G][b#]?\S*(?:\s+[A-G][b#]?\S*)+\s*$/m.test(line);
      if (isChordLine) {
        return line
          .split(/(\s+)/)
          .map((chunk) => {
            if (chunk.trim() === '') return chunk;
            const cleaned = chunk.replace(/\s*\/\s*/g, '/');
            return cleaned;
          })
          .join('');
      }
      return line;
    })
    .join('\n');

  // Detect true ChordPro bracket chords — exclude section labels like [Chorus], [Bridge]
  const bracketContents = (content.match(/\[([A-G][^\]]*)\]/g) || []).map((b) => b.slice(1, -1));
  const hasBracketChords = bracketContents.some((c) => !SECTION_LABEL_RE.test(c));

  // ChordPro directives like {start_of_verse} or {key: C}
  const hasDirectives = /\{[a-z_]+[:}]/.test(content);

  // Use ChordPro parser when content has real inline [chord] markers or {directives} without chords-over-lyrics
  const hasChordsOverLyrics = /^\s*[A-G][b#]?\S*(?:\s+[A-G][b#]?\S*)+\s*$/m.test(content);
  const isChordPro = hasBracketChords || (hasDirectives && !hasChordsOverLyrics);
  const order = isChordPro ? [0, 1, 2] : [1, 2, 0];

  for (const idx of order) {
    const p = PARSER_NAMES[idx];
    const ParserClass = (ChordSheetJS as Record<string, unknown>)[p.cls] as
      (new (opts?: { preserveWhitespace?: boolean }) => { parse(s: string): ChordSheetJS.Song }) | undefined;
    if (!ParserClass) continue;
    try {
      const song = new ParserClass({ preserveWhitespace: false }).parse(content);
      const hasChords = song.paragraphs.some((par) =>
        par.lines.some((l) =>
          l.items.some((it) => {
            const chords = (it as { chords?: string }).chords;
            if (!chords) return false;
            if (p.label === 'ChordPro' && SECTION_LABEL_RE.test(chords)) return false;
            return true;
          }),
        ),
      );
      if (hasChords) return { song, format: p.label };
    } catch {
      /* try next parser */
    }
  }

  // Fallback: parse as ChordPro (lyrics only, no chords detected)
  try {
    return { song: new ChordSheetJS.ChordProParser().parse(content), format: null };
  } catch {
    /* fall through */
  }
  return null;
}

export function parseSongAuto(content: string): ChordSheetJS.Song | null {
  const result = parseSongAutoWithFormat(content);
  return result ? result.song : null;
}

export function detectFormat(content: string): string | null {
  if (!content || !content.trim()) return null;
  const result = parseSongAutoWithFormat(content);
  return result ? result.format : null;
}

export function toChordPro(content: string): string {
  // Compact bar notation is already valid app input. Formatting it through
  // ChordSheetJS would rewrite the source, so preserve it verbatim on save.
  if (/\[\s*\|[^\]\n]*\|\s*\]/.test(content)) return content;

  // Separate directive lines from body so x_ directives survive UG parser conversion
  const lines = content.split('\n');
  const directiveLines: string[] = [];
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (DIRECTIVE_LINE_RE.test(lines[i].trim())) {
      directiveLines.push(lines[i]);
      bodyStart = i + 1;
    } else if (lines[i].trim() === '') {
      bodyStart = i + 1;
    } else {
      break;
    }
  }
  const body = lines.slice(bodyStart).join('\n');
  const song = parseSongAuto(body || content);
  if (!song) return content;
  try {
    let result = new ChordSheetJS.ChordProFormatter({ normalizeChords: false } as Record<string, unknown>).format(song);
    // Remove any directives the formatter produced that we already have in directiveLines
    if (directiveLines.length > 0) {
      const existingNames = new Set(
        directiveLines
          .map((l) => {
            const m = l.match(DIRECTIVE_RE);
            return m ? m[1].toLowerCase() : '';
          })
          .filter(Boolean),
      );
      const resultLines = result.split('\n');
      const filtered = resultLines.filter((l) => {
        const m = l.match(DIRECTIVE_RE);
        return !(m && existingNames.has(m[1].toLowerCase()));
      });
      result = [...directiveLines, ...filtered].join('\n');
    }
    return result;
  } catch {
    return content;
  }
}

// Returns the raw root of the first item that is a real chord (e.g. 'A', 'Am'), or null.
// Section labels are skipped: ChordProParser turns [Chorus] into a chord, and a naive
// root match would read the leading 'C' of "Chorus" as the key.
function firstChordRoot(song: ChordSheetJS.Song): string | null {
  for (const p of song.paragraphs) {
    for (const line of p.lines) {
      for (const item of line.items) {
        const chords = (item as { chords?: string }).chords?.trim();
        if (!chords || SECTION_LABEL_RE.test(chords)) continue;
        const m = chords.match(/^([A-G][b#]?m?)/);
        if (m) return m[1];
      }
    }
  }
  return null;
}

export function ensureKeyDirective(content: string): string {
  // Compact bar source must survive the complete persistence path byte-for-byte.
  if (/\[\s*\|[^\]\n]*\|\s*\]/.test(content)) return content;
  if (/\{key:\s*\S/.test(content)) return content;
  try {
    const root = firstChordRoot(new ChordSheetJS.ChordProParser().parse(content));
    if (root) return `{key: ${root}}\n${content}`;
  } catch {
    /* fall through */
  }
  return content;
}

class ResponsiveHtmlFormatter {
  format(song: ChordSheetJS.Song): string {
    return song.paragraphs.map((p) => this.renderParagraph(p)).join('');
  }

  private renderParagraph(p: ChordSheetJS.Paragraph): string {
    let content = p.lines.map((l) => this.renderLine(l)).join('');
    let detectedType = p.type;

    // Promote paragraph type if the first line is a label (helps CSS match)
    if (detectedType === 'none' || detectedType === 'indeterminate') {
      const firstLine = p.lines[0];
      const firstItem = firstLine?.items[0];
      if (firstItem && 'lyrics' in firstItem) {
        const lyrics = (firstItem.lyrics || '').trim();
        const chords = (firstItem.chords || '').trim();
        // Check lyrics for label or chords for bracketed label
        const potentialLabel = lyrics || chords;
        if (!lyrics !== !chords && SECTION_LABEL_RE.test(potentialLabel)) {
          detectedType = potentialLabel
            .replace(/[[\]:]/g, '')
            .split(/\s+/)[0]
            .toLowerCase()
            .replace('-', '');
        }
      }
    }

    // Only add automatic label if:
    // 1. Type is known (not none/indeterminate)
    // 2. We haven't already rendered a label badge in this paragraph
    // 3. The paragraph actually has content (prevents empty "Indeterminate" badges for metadata)
    const hasRenderableContent = p.lines.some((l) =>
      l.items.some((it) => ('lyrics' in it && it.lyrics?.trim()) || ('chords' in it && it.chords?.trim())),
    );

    if (
      detectedType !== 'none' &&
      detectedType !== 'indeterminate' &&
      !content.includes('class="label"') &&
      hasRenderableContent
    ) {
      const typeLabel = detectedType.charAt(0).toUpperCase() + detectedType.slice(1);
      content = `<div class="row section-row"><h3 class="label">${escHtml(typeLabel)}</h3></div>` + content;
    }

    return `<div class="paragraph ${detectedType}">${content}</div>`;
  }

  private renderLine(l: ChordSheetJS.Line): string {
    if (l.type === 'comment') {
      const firstItem = l.items[0];
      const content =
        (firstItem && 'content' in firstItem
          ? (firstItem as ChordSheetJS.Comment).content
          : firstItem && 'lyrics' in firstItem
            ? (firstItem as ChordSheetJS.ChordLyricsPair).lyrics
            : '') || '';

      if (SECTION_LABEL_RE.test(content.trim())) {
        const cleanLabel = content.trim().replace(/[[\]:]/g, '');
        return `<div class="row section-row"><h3 class="label">${escHtml(cleanLabel)}</h3></div>`;
      }
      return `<div class="comment">${escHtml(content)}</div>`;
    }

    // Check for section labels on normal lyric lines or bracketed chords
    const firstItem = l.items[0];
    if (firstItem && 'lyrics' in firstItem) {
      const it = firstItem as ChordSheetJS.ChordLyricsPair;
      const lyrics = (it.lyrics || '').trim();
      const chords = (it.chords || '').trim();
      // Only one of them should be present for a pure label line
      if (!lyrics !== !chords && SECTION_LABEL_RE.test(lyrics || chords)) {
        const cleanLabel = (lyrics || chords).replace(/[[\]:]/g, '');
        return `<div class="row section-row"><h3 class="label">${escHtml(cleanLabel)}</h3></div>`;
      }
    }

    const content = l.items.map((it) => this.renderItem(it as ChordSheetJS.ChordLyricsPair)).join('');
    return `<div class="row">${content}</div>`;
  }

  private renderItem(it: ChordSheetJS.ChordLyricsPair): string {
    const lyrics = it.lyrics || '';

    // No lyrics, or whitespace-only lyrics (chord-only rows like intros and
    // instrumental breaks). Render an empty lyric span so CSS (.lyrics:empty)
    // collapses the otherwise-blank line. The chord sets the column width, so
    // horizontal spacing between chords is preserved.
    if (!lyrics.trim()) {
      const chord = it.chords || '';
      return `<span class="column"><span class="chord">${escHtml(chord)}</span><span class="lyrics"></span></span>`;
    }

    // Split lyrics by whitespace chunks. We treat any sequence of spaces as one unit
    // so the browser doesn't wrap "inside" the spacing between chords.
    const chunks = lyrics.split(/(\s+)/).filter((chunk: string) => chunk !== '');
    let chordPlaced = false;

    return chunks
      .map((chunk: string) => {
        const isSpace = /\s+/.test(chunk);

        // If we've already placed the chord for this item, and this is a space,
        // output it as raw text. To prevent ugly wrapping between multiple spaces,
        // we ensure this raw text chunk is an unbreakable unit.
        if (isSpace && chordPlaced) {
          return escHtml(chunk);
        }

        // If we haven't placed the chord yet, or if it's a word, wrap in a column.
        // The chord is only attached to the VERY FIRST chunk (word or space).
        const rawChord = chordPlaced ? '' : it.chords || '';
        const currentChord = rawChord;
        chordPlaced = true;

        const chords = `<span class="chord">${escHtml(currentChord)}</span>`;
        const lyricText = escHtml(chunk);
        return `<span class="column">${chords}<span class="lyrics">${lyricText}</span></span>`;
      })
      .join('');
  }
}

function transposeUnsupportedSymbolChords(song: ChordSheetJS.Song, semitones: number): void {
  song.mapChordLyricsPairs((pair) => {
    const item = pair as unknown as { chords?: string };
    const match = item.chords?.match(/^([A-G](?:#|b)?)([°ø∆].*?)(?:\/([A-G](?:#|b)?))?$/);
    if (!match) return pair;

    try {
      const root = ChordSheetJS.Chord.parse(match[1])?.transpose(semitones).toString();
      const bass = match[3]
        ? ChordSheetJS.Chord.parse(match[3])?.transpose(semitones).toString()
        : null;
      if (root) item.chords = `${root}${match[2]}${bass ? `/${bass}` : ''}`;
    } catch {
      /* leave unsupported symbol spelling unchanged */
    }
    return pair;
  });
}

export function prepareSong(content: string, semitones = 0, nashville = false): ChordSheetJS.Song | null {
  try {
    const song = parseSongAuto(content);
    if (!song) return null;

    let transposed = semitones !== 0 ? song.transpose(semitones) : song;
    // ChordSheetJS preserves °, ø, and ∆ tokens but does not transpose their
    // roots. Handle those accepted symbols explicitly without rewriting source.
    if (semitones !== 0) transposeUnsupportedSymbolChords(transposed, semitones);
    // Preserve source spelling at concert pitch; normalize only after explicit transposition.
    if (semitones !== 0) fixChordAccidentals(transposed);

    const keyRaw = transposed.key || (transposed.getMetadataValue ? transposed.getMetadataValue('key') : null);
    const key = typeof keyRaw === 'string' ? keyRaw : keyRaw?.toString() || null;
    if (nashville && key && ChordSheetJS.Chord) {
      const cloned = transposed.clone();
      convertToNashville(cloned, key);
      transposed = cloned;
    }
    return transposed;
  } catch {
    return null;
  }
}

export function renderChordPro(content: string, semitones = 0, nashville = false): string {
  const song = prepareSong(content, semitones, nashville);
  if (!song) {
    return `<pre style="font-family:'JetBrains Mono',monospace;font-size:13px;white-space:pre-wrap;color:var(--text)">${escHtml(content)}</pre>`;
  }
  return `<div class="chord-sheet">${new ResponsiveHtmlFormatter().format(song)}</div>`;
}

export function fixChordAccidentals(song: ChordSheetJS.Song): void {
  song.mapChordLyricsPairs((pair) => {
    const it = pair as unknown as { chords?: string };
    if (it.chords) it.chords = normalizeChord(it.chords);
    return pair;
  });
}

export function convertToNashville(song: ChordSheetJS.Song, key: string): ChordSheetJS.Song {
  song.mapChordLyricsPairs((pair) => {
    const it = pair as unknown as { chords?: string };
    const chords = it.chords?.trim();
    if (!chords || SECTION_LABEL_RE.test(chords)) return pair;
    try {
      const symbol = chords.match(/^([A-G](?:#|b)?)([°ø∆Δ+].*?)(?:\/([A-G](?:#|b)?))?$/);
      if (symbol) {
        const root = ChordSheetJS.Chord.parse(symbol[1])?.toNumeric(key).toString();
        const bass = symbol[3]
          ? ChordSheetJS.Chord.parse(symbol[3])?.toNumeric(key).toString()
          : null;
        if (root) it.chords = `${root}${symbol[2]}${bass ? `/${bass}` : ''}`;
        return pair;
      }

      const c = ChordSheetJS.Chord.parse(chords);
      if (c) it.chords = c.toNumeric(key).toString();
    } catch {
      /* skip */
    }
    return pair;
  });
  return song;
}

export function getSongKey(content: string, semitones = 0): string {
  try {
    const parser = new ChordSheetJS.ChordProParser();
    const song = parser.parse(content);
    const transposed = semitones !== 0 ? song.transpose(semitones) : song;
    const keyRaw = transposed.key || (transposed.getMetadataValue ? transposed.getMetadataValue('key') : null);
    const key = typeof keyRaw === 'string' ? keyRaw : keyRaw?.toString() || null;
    if (key) return normalizeKey(key);
    // Fallback: derive key from first chord
    const root = firstChordRoot(transposed);
    if (root) return normalizeKey(root);
  } catch {
    /* fall through */
  }
  return '';
}

export function songHasKey(content: string, semitones: number): boolean {
  try {
    const song = new ChordSheetJS.ChordProParser().parse(content);
    const transposed = semitones ? song.transpose(semitones) : song;
    return !!(transposed.key || (transposed.getMetadataValue ? transposed.getMetadataValue('key') : null));
  } catch {
    return false;
  }
}

export { escHtml } from './util';

export function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'owner';
}

export function clampFontSize(val: number): number {
  return Math.max(-3, Math.min(5, val));
}

export function fontScaleValue(offset: number): string | undefined {
  return offset ? String(1 + offset * 0.12) : undefined;
}

export function autoFit(): { fontSize: number; twoCol: boolean } {
  const wrap = document.querySelector('.chord-sheet-wrap') as HTMLElement | null;
  if (!wrap) return { fontSize: 0, twoCol: false };

  const output = wrap.querySelector('#chord-output') as HTMLElement | null;
  if (!output) return { fontSize: 0, twoCol: false };

  const wasTwoCol = wrap.classList.contains('two-col');
  const prevScale = wrap.style.getPropertyValue('--font-scale');

  const tryFit = (offset: number, twoCol: boolean): boolean => {
    // Apply settings and measure actual layout
    if (twoCol) wrap.classList.add('two-col');
    else wrap.classList.remove('two-col');

    if (offset) wrap.style.setProperty('--font-scale', String(1 + offset * 0.12));
    else wrap.style.removeProperty('--font-scale');

    // Calculate available height inside the wrap, accounting for padding (24px top + 24px bottom)
    const available = wrap.clientHeight - 48;

    // Safety check: if clientHeight is 0 (not rendered yet), fall back to viewport calc
    if (available <= 0) {
      const viewportAvailable = window.innerHeight - wrap.getBoundingClientRect().top - 48 - 24; // padding + margin
      return output.scrollHeight <= viewportAvailable;
    }

    return output.scrollHeight <= available;
  };

  const isWide = window.innerWidth >= 640;

  if (isWide) {
    // 1. Try 1-col, font 0 (The Gold Standard)
    if (tryFit(0, false)) return { fontSize: 0, twoCol: false };

    // 2. Try 2-col, font 0 (Prioritize 2-col over shrinking font)
    if (tryFit(0, true)) return { fontSize: 0, twoCol: true };

    // 3. Try shrinking font in 2-col mode
    for (let offset = -1; offset >= -3; offset--) {
      if (tryFit(offset, true)) return { fontSize: clampFontSize(offset), twoCol: true };
    }

    // 4. Try shrinking font in 1-col mode
    for (let offset = -1; offset >= -3; offset--) {
      if (tryFit(offset, false)) return { fontSize: clampFontSize(offset), twoCol: false };
    }
  } else {
    // Phone/Portrait: 1-col is preferred
    for (let offset = 0; offset >= -3; offset--) {
      if (tryFit(offset, false)) return { fontSize: clampFontSize(offset), twoCol: false };
    }
    // Last resort for phone: 2-col with tiny font (unlikely to be better, but just in case)
    if (tryFit(-3, true)) return { fontSize: -3, twoCol: true };
  }

  // Restore original state before returning fallback
  if (wasTwoCol) wrap.classList.add('two-col');
  else wrap.classList.remove('two-col');
  if (prevScale) wrap.style.setProperty('--font-scale', prevScale);
  else wrap.style.removeProperty('--font-scale');

  // If nothing fits, use smallest font and appropriate column count
  return { fontSize: -3, twoCol: isWide };
}

export function resolveEffectivePreferences(
  entry: SetlistEntry | null | undefined,
  global: SetlistPreferences,
): SetlistPreferences {
  if (!entry) return global;
  return {
    nashville: entry._num != null ? !!entry._num : global.nashville,
    twoCol: entry._twoCol != null ? entry._twoCol : entry.two_col != null ? !!entry.two_col : global.twoCol,
    fontSize: entry._font != null ? entry._font : entry.font != null ? entry.font : global.fontSize,
    hideYt: entry._hideYt != null ? entry._hideYt : global.hideYt,
  };
}
