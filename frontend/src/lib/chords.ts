import * as ChordSheetJS from 'chordsheetjs';
import { escHtml } from './util';
import { normalizeKey, normalizeChord, preferredAccidental } from './keys';
import { SEPARATOR_TOKEN_RE } from './theory';
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
  String.raw`^[\[]?(?:${SECTION_VARIANT}|${REPEAT_SECTION_VARIANT}|FINAL\s+CHORD)\s*:?[\]]?$`,
  'i',
);

export function isSectionLabel(value: string): boolean {
  return SECTION_LABEL_RE.test(value.trim());
}

// Maps every recognised variant of a section name to its canonical display form
// (Title-Case-with-Spaces, with hyphens inside compound names preserved).
// The roadmap chip, the on-page heading, and the stored canonical form all
// share this single source of truth so a chart imported as `VERSE1` and one
// imported as `verse 1` both render the same way. Each regex accepts both
// spaced (`Verse 1`) and tight (`Verse1`) variants because the parser often
// hands the type back with the number glued on. Unknown variants fall back to
// the cleaned, trimmed, single-spaced input.
const SECTION_CANONICAL: Array<{ name: string; root: string }> = [
  { name: 'half\\s*[- ]?\\s*chorus', root: 'Half-Chorus' },
  { name: 'alt\\s+verse', root: 'Alt Verse' },
  { name: 'vamp', root: 'Vamp' },
  { name: 'verse', root: 'Verse' },
  { name: 'pre\\s*[- ]?\\s*chorus', root: 'Pre-Chorus' },
  { name: 'chorus', root: 'Chorus' },
  { name: 'bridge', root: 'Bridge' },
  { name: 'intro', root: 'Intro' },
  { name: 'outro', root: 'Outro' },
  { name: 'interlude', root: 'Interlude' },
  { name: 'ending', root: 'Ending' },
  { name: 'tag', root: 'Tag' },
  { name: 'coda', root: 'Coda' },
  { name: 'break', root: 'Break' },
  { name: 'solo', root: 'Solo' },
  { name: 'instrumental', root: 'Instrumental' },
  { name: 'refrain', root: 'Refrain' },
];

export function canonicalizeSectionLabel(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[[\]:]/g, '')
    .replace(/\s+/g, ' ');
  if (!cleaned) return cleaned;
  // REPEAT is a wrapper: canonicalise the inner section first.
  const repeatMatch = cleaned.match(/^repeat\s+(.+)$/i);
  if (repeatMatch) return `REPEAT ${canonicalizeSectionLabel(repeatMatch[1])}`;
  if (/^final\s+chord$/i.test(cleaned)) return 'Final Chord';
  for (const { name, root } of SECTION_CANONICAL) {
    const m = cleaned.match(new RegExp(`^${name}(?:\\s?(\\d+))?(.*)$`, 'i'));
    if (m) {
      const number = m[1] ? ` ${m[1]}` : '';
      const suffix = m[2]
        .trim()
        .replace(/^(?:x\s*(\d+)|(\d+)\s*x)$/i, (_match, after, before) => `X ${after || before}`);
      return `${root}${number}${suffix ? ` ${suffix}` : ''}`;
    }
  }
  // Unknown variant: keep cleaned, single-spaced.
  return cleaned;
}

// Compact bar notation is already valid app input. Formatting it through
// ChordSheetJS would rewrite the source, so the on-save normalizer preserves
// it verbatim. Centralising the early-return means future save paths can't
// drift away from this guarantee.
export function isCompactBarNotation(content: string): boolean {
  for (const match of content.matchAll(/\[([^\]\n]+)\]/g)) {
    if (expandCompactBarGroup(match[1]) !== null) return true;
  }
  return false;
}

// Normalises the source on save so every persisted chart shares the same
// shape: directive names lowercased, one trailing newline, no trailing
// whitespace. Body content is left untouched apart from those housekeeping
// rules; chord placement, lyric text, and bar notation all pass through
// unchanged so this never alters a chart's musical content.
export function normalizeOnSave(content: string): string {
  if (!content) return content;
  if (isCompactBarNotation(content)) {
    // Compact bar source must survive byte-for-byte. Just trim trailing
    // blank lines and ensure a single trailing newline.
    return content.replace(/\s+$/, '') + '\n';
  }
  const lines = content.split('\n');
  const normalised = lines.map((line) => {
    const m = line.match(/^\{([a-z_]+):\s*([^}]*)\}\s*$/i);
    if (!m) return line;
    return `{${m[1].toLowerCase()}: ${m[2].trim()}}`;
  });
  return normalised.join('\n').replace(/\s+$/, '') + '\n';
}

// Single entry point every save path should use. It runs the structural
// reformat, ensures a key directive exists, and applies the housekeeping
// rules. Compact bar source is preserved verbatim by both
// toChordPro and ensureKeyDirective already; the trailing-newline tidy
// in normalizeOnSave still applies to it.
export function prepareForPersist(content: string): string {
  return normalizeOnSave(ensureKeyDirective(toChordPro(content)));
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
  String.raw`^(?:(?:maj|min|m|dim|aug)?${COMPACT_BAR_EXTENSION}?|[°ø∆Δ+]${COMPACT_BAR_EXTENSION}?|sus(?:[24])?|add(?:2|4|6|9|11|13)|\((?:add|no|sus)?[#b]?(?:2|3|4|5|6|9|11|13)\))(?:${COMPACT_BAR_DECORATION})*$`,
);
const COMPACT_BAR_CHORD_RE = new RegExp(String.raw`^(${COMPACT_BAR_ROOT})([^/]*)(?:\/(${COMPACT_BAR_ROOT}))?$`);

function isCompactBarChord(token: string): boolean {
  const match = token.match(COMPACT_BAR_CHORD_RE);
  if (!match || !COMPACT_BAR_SUFFIX_RE.test(match[2])) return false;

  const decorations = match[2].match(new RegExp(COMPACT_BAR_DECORATION, 'g')) ?? [];
  const normalized = decorations.map((part) => part.toLowerCase());
  if (new Set(normalized).size !== normalized.length) return false;
  if (normalized.filter((part) => part.startsWith('sus')).length > 1) return false;

  const susIntervals = new Set(normalized.filter((part) => part.startsWith('sus')).map((part) => part.slice(3)));
  const addIntervals = normalized.filter((part) => part.startsWith('add')).map((part) => part.slice(3));
  if (addIntervals.some((interval) => susIntervals.has(interval))) return false;

  const decoratedIntervals = normalized.map((part) => part.match(/\d+$/)?.[0]).filter(Boolean);
  const baseExtension = match[2].match(/^(?:maj|min|m|dim|aug)?(2|4|5|6|7|9|11|13)/)?.[1];
  if (baseExtension && decoratedIntervals.includes(baseExtension)) return false;
  return true;
}

// A deliberately narrower version of theory.ts's SEPARATOR_TOKEN_RE: unlike
// that shared definition, this one excludes bare "/" runs. Inside an
// existing [| |] bracket group a lone "/" between two unrelated chords is
// ambiguous — there's no established chord for it to hold — and the compact-
// bar tests already lock in rejecting that (`[| C / D |]` must stay
// unchanged). Bare-slash *continuation* of a chord ("C///") is handled
// separately below by the glue-splitting logic that already existed before
// this token, so nothing here needs to accept "/" on its own.
const NON_CHORD_BAR_TOKEN_RE = /^(?:-+|%|x\d+|\d+x|N\.?C\.?)$/i;

// Matches lyric text that is pure bar/hold-beat punctuation ("|", "/",
// "///|", etc.) with nothing else in it — used by ResponsiveHtmlFormatter to
// tell a real lyric line apart from an instrumental bar-notation line whose
// "lyrics" are just layout punctuation.
const BAR_PUNCTUATION_RE = /^[|/]+$/;

function parseCompactBarSegment(segment: string): string | null {
  // Non-chord notation that legitimately shares a bar line with real chords
  // (N.C., %, x2/2x repeat counts, dash rests) — pass through as literal
  // text rather than rejecting the whole group or trying to bracket/transpose
  // it as a chord.
  if (NON_CHORD_BAR_TOKEN_RE.test(segment)) return segment;

  const parts = segment.split(/(\/{2,})/);
  if (parts.length === 1) {
    if (isCompactBarChord(segment)) return `[${segment}]`;
    // A complete slash chord can carry a trailing SINGLE "/" as a glued hold
    // marker too, not just a "//" run — e.g. Firm Foundation's real stored
    // Interlude: "Ebmaj7/F/" (Ebmaj7 over F, held one extra beat). The
    // /{2,} split above already handles a trailing run of two or more
    // slashes on any chord (see "G///" and "Bb/D///"); this only covers the
    // single-slash case, and only when the token being stripped already
    // contains its OWN internal slash (a genuine, complete slash chord like
    // "Ebmaj7/F"). A bare root chord with one trailing slash and no bass
    // note of its own ("C/") stays rejected on purpose — that shape reads as
    // a slash chord missing its bass note, not a hold marker, and the
    // existing "[| C/ |]" test locks in treating it as invalid rather than
    // guessing.
    const trailingHold = segment.match(/^(.+\/.*[^/])(\/+)$/);
    if (trailingHold && isCompactBarChord(trailingHold[1])) {
      return `[${trailingHold[1]}]${trailingHold[2]}`;
    }
    return null;
  }
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

// Expand only a complete, validated compact-bar group. Anything that
// contains an unsupported token is returned verbatim, preventing bracketed
// prose and malformed annotations from being silently reinterpreted as
// chords.
//
// Two shapes this recognizes beyond a plain glued chord list:
//
// 1. A standalone run of "/" as its own whitespace-delimited token (not
//    glued onto a chord), e.g. Center's real stored Intro:
//    "[|G / / / |Gmaj7 / / / |Cmaj7 / / / |Cmaj7 / / / |]". The app's own
//    glued shorthand ("G///") was already handled by parseCompactBarSegment,
//    but a bare "/" token has nothing glued to it, so it used to make the
//    ENTIRE group fail (parseCompactBarSegment("/") returns null), leaving
//    the whole bracket as literal, untransposed text — same failure class as
//    the unbracketed bar-notation bug fixed last round, just one layer
//    deeper (this content was already inside brackets). Fixed by tracking
//    whether a real chord is currently "in scope" (hasChord) and treating a
//    standalone slash run as a continuation of it — mirroring
//    glueBarNotationLine's identical handling for the unbracketed case,
//    including N.C. silence (heldNoChord) and carry-over across "|"
//    boundaries (deliberately not reset per bar, matching that function).
//    A lone "/" with no chord ever established (e.g. "[| /C |]") still
//    correctly fails closed.
//
// 2. No leading/trailing "|" framing the whole group, only internal bar
//    separators, e.g. What A Beautiful Name's real stored Instrumental:
//    "[G///| A///| Bm///| F#m///]". The old boundary check
//    (`trimmed.startsWith('|') && trimmed.endsWith('|')`) rejected this
//    outright before even looking at its content, even though the content
//    itself is otherwise valid compact-bar notation. Per-token validation
//    below still rejects anything that isn't a recognizable chord or marker,
//    so relaxing this boundary doesn't let prose through — e.g. "[Chorus |
//    Bridge]" still fails because "Chorus" isn't a valid chord token, not
//    because it lacks outer pipes.
function expandCompactBarGroup(inner: string): string | null {
  const trimmed = inner.trim();
  if (!trimmed.includes('|')) return null;

  let output = '';
  let cursor = 0;
  let hasChord = false;
  let heldNoChord = false;
  while (cursor < inner.length) {
    if (/\s|\|/.test(inner[cursor])) {
      output += inner[cursor];
      cursor += 1;
      continue;
    }

    let end = cursor;
    while (end < inner.length && !/\s|\|/.test(inner[end])) end += 1;
    const token = inner.slice(cursor, end);

    if (/^\/+$/.test(token)) {
      if (hasChord) {
        output += token;
      } else if (!heldNoChord) {
        return null;
      }
      // else: still-held N.C. silence — drop the beat marker silently,
      // matching glueBarNotationLine's identical behavior.
      cursor = end;
      continue;
    }

    const compactHold = token.match(/^(.+?)(\/+)$/);
    if (compactHold && compactHold[1].includes('/') && isCompactBarChord(compactHold[1])) {
      output += `[${compactHold[1]}]${compactHold[2]}`;
      hasChord = true;
      heldNoChord = false;
      cursor = end;
      continue;
    }

    const expanded = parseCompactBarSegment(token);
    if (expanded === null) return null;
    output += expanded;
    if (/^N\.?C\.?$/i.test(token)) {
      hasChord = false;
      heldNoChord = true;
    } else if (!NON_CHORD_BAR_TOKEN_RE.test(token)) {
      hasChord = true;
      heldNoChord = false;
    }
    cursor = end;
  }
  return output;
}

function expandCompactBarNotation(text: string): string {
  return text.replace(/\[([^\]\n]*\|[^\]\n]*)\]/g, (match, inner: string) => expandCompactBarGroup(inner) ?? match);
}

// Real chord charts (typed by hand, pasted from a songbook, or extracted
// from a PDF that isn't the Worship-Together-specific format) commonly write
// instrumental sections as bar/pipe notation with each beat spelled out as
// its own token — "|G / / / |Gmaj7 / / / |Cmaj7 / / / |" — rather than the
// app's own glued compact-bar shorthand ("|G/// Gmaj7/// Cmaj7///|") or
// inline [G] brackets. This is a THIRD, distinct shape from both of those:
// no brackets at all, and the repeat/hold slashes are separate space-
// delimited tokens rather than glued onto the chord token. Neither
// expandCompactBarNotation (needs an existing [| |] bracket) nor
// bracketStandaloneChordLines (needs the line to start with a chord letter,
// not "|") recognizes it, so it silently passed through as literal lyric
// text and never transposed.
//
// This glues each run of bare "/" tokens onto the chord that precedes it
// (carrying the chord across a bar boundary when a bar starts with "/"),
// producing the same glued shorthand the app's compact-bar system already
// parses correctly, then wraps the result in [| |] so the existing,
// already-tested expandCompactBarNotation above does the actual expansion.
// Fails closed (leaves the line untouched) on anything that doesn't cleanly
// resolve to a chord, a held beat, or a recognized non-chord marker (N.C.,
// %, x2, dash rests — the same vocabulary the standalone Tools chart engine
// in theory.ts already recognizes).
function glueBarNotationLine(line: string): string | null {
  const segments = line.split('|');
  if (segments.length < 3) return null;
  if (segments[0].trim() !== '' || segments[segments.length - 1].trim() !== '') return null;

  let lastChord: string | null = null;
  // True once an explicit N.C. establishes "deliberately no chord right now".
  // A bare "/" that follows just continues that held silence rather than
  // failing for lack of anything to glue onto.
  let heldNoChord = false;
  const outBars: string[] = [];
  for (let i = 1; i < segments.length - 1; i++) {
    const tokens = segments[i].trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;

    const outTokens: string[] = [];
    let current: string | null = null;
    for (const tok of tokens) {
      if (/^\/+$/.test(tok)) {
        if (current !== null) current += tok;
        else if (lastChord !== null) current = lastChord + tok;
        else if (heldNoChord)
          continue; // still no chord — drop the beat marker silently
        else return null;
        continue;
      }
      if (SEPARATOR_TOKEN_RE.test(tok)) {
        if (current !== null) {
          outTokens.push(current);
          current = null;
        }
        outTokens.push(tok);
        if (/^N\.?C\.?$/i.test(tok)) {
          lastChord = null;
          heldNoChord = true;
        }
        continue;
      }
      if (!isCompactBarChord(tok)) return null;
      if (current !== null) outTokens.push(current);
      current = tok;
      lastChord = tok;
      heldNoChord = false;
    }
    if (current !== null) outTokens.push(current);
    outBars.push(outTokens.join(' '));
  }
  return outBars.join(' | ');
}

function bracketBarNotationLines(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || line.includes('[') || line.includes(']')) {
        return line;
      }
      const glued = glueBarNotationLine(trimmed);
      return glued === null ? line : `[| ${glued} |]`;
    })
    .join('\n');
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

const BARE_CHORD_LINE_RE = /^\s*[A-G][b#]?\S*(?:\s+[A-G][b#]?\S*)+\s*$/;

function isBareChordLine(line: string): boolean {
  return BARE_CHORD_LINE_RE.test(line) && !line.includes('[');
}

// A document that mostly uses inline [bracket] chords (ChordPro-style) may
// still write an instrumental section — Intro, Interlude, Turnaround, Outro
// — as a bare chord line with no lyric line underneath it, since brackets
// don't make sense without lyrics to attach them to. The ChordPro parser has
// no way to recognize a bare, unbracketed line as chords: it reads it as
// ordinary lyric text, so those chords silently survive transposition
// unchanged instead of moving with the rest of the song. Bracket a bare
// chord line when it has no paired lyric line following (blank line,
// another chord-only line, a section label, or end of content), so the
// ChordPro parser picks it up like any other instrumental line. Only do this
// when the document already has real bracket chords elsewhere — otherwise
// this is a genuine chords-over-lyrics document, and a real two-line
// chord/lyric pairing must be left alone for ChordsOverWordsParser to match
// by position.
function bracketStandaloneChordLines(text: string, hasExistingBracketChords: boolean): string {
  if (!hasExistingBracketChords) return text;
  const lines = text.split('\n');
  return lines
    .map((line, i) => {
      if (!isBareChordLine(line)) return line;
      const next = lines[i + 1];
      const standalone =
        next === undefined || next.trim() === '' || isSectionLabel(next.trim()) || isBareChordLine(next);
      if (!standalone) return line;
      return line.replace(/\S+/g, (token) => `[${token}]`);
    })
    .join('\n');
}

export function parseSongAutoWithFormat(rawContent: string): { song: ChordSheetJS.Song; format: string | null } | null {
  // Pre-process content: force all chords to preferred enharmonic spellings (Sharps)
  // and fix spacing issues in slash chords (e.g. [A / C#] -> [A/C#]) BEFORE parsing.
  // This ensures transpose and Nashville work correctly.
  let content = expandCompactBarNotation(bracketBarNotationLines(rawContent)).replace(
    /\[([^\]]+)\]/g,
    (match, inner) => {
      // Rejected outer compact-bar groups are fail-closed source. Do not let the
      // generic slash normalizer mutate or reinterpret them after validation.
      const trimmed = inner.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) return match;

      // 1. Fix spaces around slashes
      const cleaned = inner.replace(/\s*\/\s*/g, '/');
      // ChordSheetJS treats a bracketed section heading such as [Intro] as
      // a chord named "Intro" during transpose. Strip only the brackets so
      // the heading remains a lyric/comment label instead of being mutated
      // into "IIntro" (or similar) when the chart key changes.
      if (SECTION_LABEL_RE.test(cleaned)) return canonicalizeSectionLabel(cleaned);
      // Preserve the source chart's written enharmonic spelling.
      return `[${cleaned}]`;
    },
  );

  content = ensureSectionParagraphBreaks(content);

  {
    // Detect pre-existing bracket chords BEFORE bracketing standalone
    // instrumental lines below, so the decision reflects how the song was
    // actually authored, not a self-fulfilling result of this same step.
    const preexistingBracketContents = (content.match(/\[([A-G][^\]]*)\]/g) || []).map((b) => b.slice(1, -1));
    const hasPreexistingBracketChords = preexistingBracketContents.some((c) => !SECTION_LABEL_RE.test(c));
    content = bracketStandaloneChordLines(content, hasPreexistingBracketChords);
  }

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
  if (isCompactBarNotation(content)) return content;

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
  if (isCompactBarNotation(content)) return content;
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
      const typeLabel = canonicalizeSectionLabel(detectedType);
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
        const cleanLabel = canonicalizeSectionLabel(content.trim());
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
        const cleanLabel = canonicalizeSectionLabel(lyrics || chords);
        return `<div class="row section-row"><h3 class="label">${escHtml(cleanLabel)}</h3></div>`;
      }
    }

    const content = l.items.map((it) => this.renderItem(it as ChordSheetJS.ChordLyricsPair)).join('');
    const rowClass = this.isInstrumentalLine(l) ? 'row row-instrumental' : 'row';
    return `<div class="${rowClass}">${content}</div>`;
  }

  // A bar-notation/instrumental line (Intro, Interlude, etc.) renders as a
  // run of many small chord chips with only bar/slash punctuation between
  // them — no real lyric words. Depending on how the source was typed, that
  // punctuation can land as its own separate column (e.g. "G / / /", each
  // token space-delimited) or glued onto the preceding chord's lyric span
  // (e.g. "G///|"). Either shape has ONLY punctuation for lyrics content, so
  // detect it that way rather than relying on paragraph type (which can be
  // "none"/"indeterminate", e.g. an Interlude with no section-label line)
  // or on which of the two source shapes produced it. Marked with a class so
  // CSS can give these dense chip rows clearer spacing without changing the
  // font/line rhythm of ordinary chords-over-lyrics verses.
  private isInstrumentalLine(l: ChordSheetJS.Line): boolean {
    let hasChord = false;
    for (const item of l.items) {
      if (!('lyrics' in item)) return false;
      const it = item as ChordSheetJS.ChordLyricsPair;
      if ((it.chords || '').trim()) hasChord = true;
      const lyrics = (it.lyrics || '').trim();
      if (!lyrics) continue;
      // A pair's lyrics can be one combined string with embedded spaces
      // (e.g. "/ / / |" from the Center-shaped source, before renderItem's
      // own chunk-splitting later breaks it into separate columns), so check
      // token by token rather than the string as a whole.
      for (const tok of lyrics.split(/\s+/)) {
        if (!BAR_PUNCTUATION_RE.test(tok) && !SEPARATOR_TOKEN_RE.test(tok)) return false;
      }
    }
    return hasChord;
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

        // A column with no chord of its own whose lyric text is pure bar
        // punctuation ("|", "/", "///", "N.C.", ...) is layout marking, not
        // a word — mark it so row-instrumental spacing (see chord-sheet.css)
        // can keep it tight against its neighbor instead of giving it the
        // same generous gap as an actual chord chip.
        const isPunctColumn = !currentChord && (BAR_PUNCTUATION_RE.test(chunk) || SEPARATOR_TOKEN_RE.test(chunk));
        const isBarColumn = !currentChord && /^\|+$/.test(chunk);
        const columnClass = isPunctColumn ? 'column column-punct' : 'column';
        const barAttribute = isBarColumn ? ' data-bar="true"' : '';

        const lyricText = escHtml(chunk);
        return `<span class="${columnClass}"${barAttribute}><span class="chord">${escHtml(currentChord)}</span><span class="lyrics">${lyricText}</span></span>`;
      })
      .join('');
  }
}

function transposeUnsupportedSymbolChords(song: ChordSheetJS.Song, semitones: number, accidental?: '#' | 'b'): void {
  song.mapChordLyricsPairs((pair) => {
    const item = pair as unknown as { chords?: string };
    const match = item.chords?.match(/^([A-G](?:#|b)?)([°ø∆].*?)(?:\/([A-G](?:#|b)?))?$/);
    if (!match) return pair;

    try {
      let rootChord = ChordSheetJS.Chord.parse(match[1])?.transpose(semitones);
      if (rootChord && accidental) rootChord = rootChord.useAccidental(accidental);
      const root = rootChord?.toString();

      let bassChord = match[3] ? ChordSheetJS.Chord.parse(match[3])?.transpose(semitones) : null;
      if (bassChord && accidental) bassChord = bassChord.useAccidental(accidental);
      const bass = bassChord?.toString();

      if (root) item.chords = `${root}${match[2]}${bass ? `/${bass}` : ''}`;
    } catch {
      /* leave unsupported symbol spelling unchanged */
    }
    return pair;
  });
}

// Reads the key ChordSheetJS lands on after a plain (no-accidental) transpose,
// falling back to the first real chord root when the song has no {key}
// directive. Used only to pick a single accidental for the whole song below —
// a lone note has no internal-consistency problem, so the plain transpose's
// default spelling is a safe source for this regardless of what it later does
// to individual chords.
function detectDestinationKey(transposedNoAccidental: ChordSheetJS.Song): string | null {
  const keyRaw =
    transposedNoAccidental.key ||
    (transposedNoAccidental.getMetadataValue ? transposedNoAccidental.getMetadataValue('key') : null);
  const key = typeof keyRaw === 'string' ? keyRaw : keyRaw?.toString() || null;
  return key || firstChordRoot(transposedNoAccidental);
}

export function prepareSong(content: string, semitones = 0, nashville = false): ChordSheetJS.Song | null {
  try {
    const song = parseSongAuto(content);
    if (!song) return null;

    let transposed = song;
    if (semitones !== 0) {
      // ChordSheetJS's default transpose() picks sharp or flat per chord
      // independently, which produces mixed spelling within one key (e.g.
      // G# Bbm Cm C# Eb Fm Gdim when transposing to "Ab"). Detect the
      // destination key first, then re-transpose the whole song with one
      // consistent accidental matching the app's canonical key label.
      const provisional = song.transpose(semitones);
      const destKey = detectDestinationKey(provisional);
      const accidental = destKey ? preferredAccidental(destKey) : undefined;

      transposed = accidental ? song.transpose(semitones, { accidental }) : provisional;
      // ChordSheetJS preserves °, ø, and ∆ tokens but does not transpose their
      // roots. Handle those accepted symbols explicitly without rewriting source.
      transposeUnsupportedSymbolChords(transposed, semitones, accidental);
      // A small set of spellings (A#/D#/Cb) that should never appear
      // regardless of the accidental chosen above.
      fixChordAccidentals(transposed);
    }

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
    // Unparseable source: fall back to the same themed surface as a parsed
    // chart so the page tone, fonts, and spacing stay consistent.
    return `<div class="chord-sheet"><div class="chord-sheet-fallback">${escHtml(content)}</div></div>`;
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
        const bass = symbol[3] ? ChordSheetJS.Chord.parse(symbol[3])?.toNumeric(key).toString() : null;
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
