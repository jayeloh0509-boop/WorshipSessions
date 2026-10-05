const { isChordSymbol, isBarNotationLine } = require('./chordSyntax');

const SECTION_LABEL_RE =
  /^(?:intro|verse|alt verse|pre-?chorus|chorus|half-chorus|bridge|interlude|instrumental|vamp|tag|outro|ending|refrain|break|solo)\s*\d*:?$/i;
// Arrangement directives such as `Repeat Chorus`, `Repeat Bridge x2`, `Repeat Vamp 2 x2`.
const REPEAT_RE = /^repeat\s+[A-Za-z-]+(?:\s+[A-Za-z-]+)?(?:\s+\d+)?(?:\s*\([^)]*\))?(?:\s+(?:x|×)\s*\d+)?$/i;
// Standalone repeat markers such as `X2` / `x4`, and the no-chord marker `[N.C.]`.
const REPEAT_MARK_RE = /^(?:x|×)\s*\d+$/i;
const NO_CHORD_RE = /^\[N\.?C\.?\]$/i;
const COMMENT_SECTION_RE = /^\{comment:\s*([^}]+)\}$/i;
const CHORD_TOKEN_RE = /\[([^\]]+)\]/g;

function lineKind(line) {
  const text = String(line || '');
  const trimmed = text.trim();
  if (!trimmed) return 'blank';
  const comment = trimmed.match(COMMENT_SECTION_RE);
  if (comment && SECTION_LABEL_RE.test(comment[1].trim())) return 'section';
  if (/^\{[^}]+\}$/.test(trimmed)) return 'metadata';
  if (REPEAT_MARK_RE.test(trimmed)) return 'repeat';
  if (NO_CHORD_RE.test(trimmed)) return 'chord-only';
  if (SECTION_LABEL_RE.test(trimmed)) return 'section';
  if (REPEAT_RE.test(trimmed)) return 'repeat';
  if (isBarNotationLine(text)) return 'chord-only';
  const chords = [...text.matchAll(CHORD_TOKEN_RE)].map((m) => m[1]).filter(isChordSymbol);
  if (chords.length && text.replace(CHORD_TOKEN_RE, '').trim() === '') return 'chord-only';
  if (chords.length) return 'lyric-with-chords';
  return 'lyrics';
}

function inspectChart(content) {
  const lines = String(content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const warnings = [];
  let sections = 0;
  let chordLines = 0;
  let lyricLines = 0;
  lines.forEach((line, index) => {
    const kind = lineKind(line);
    if (kind === 'section') sections += 1;
    // A trailing chord-only line is legitimate (e.g. the final chord under
    // "Ending"). Only chord-only lines that appear before any section label
    // are ambiguous.
    if (kind === 'chord-only' && sections === 0) {
      warnings.push({
        line: index + 1,
        code: 'unlabelled-chords',
        message: 'Chord-only line appears before any section label.',
      });
    }
    if (kind === 'chord-only' && index + 1 >= lines.length) {
      let prev = index - 1;
      while (prev >= 0 && lineKind(lines[prev]) === 'blank') prev -= 1;
      // A final chord line directly under a section label (e.g. "Ending") is intentional.
      if (prev < 0 || lineKind(lines[prev]) !== 'section') {
        warnings.push({ line: index + 1, code: 'orphan-chords', message: 'Chord line has no following lyric line.' });
      }
    }
    if (kind === 'chord-only' || kind === 'lyric-with-chords') chordLines += 1;
    if (kind === 'lyrics' || kind === 'lyric-with-chords') lyricLines += 1;
    if (kind === 'lyrics' && index > 0 && line.trim() && lineKind(lines[index - 1]) === 'lyrics')
      warnings.push({
        line: index + 1,
        code: 'unattached-lyrics',
        message: 'Lyric line has no detected chord context.',
      });
  });
  if (!sections)
    warnings.push({ line: 1, code: 'missing-sections', message: 'No standard section labels were detected.' });
  if (!chordLines) warnings.push({ line: 1, code: 'missing-chords', message: 'No usable chord lines were detected.' });
  return {
    lineCount: lines.length,
    sections,
    chordLines,
    lyricLines,
    warnings,
    status: warnings.length ? 'needs-review' : 'verified',
  };
}

module.exports = { inspectChart, lineKind };
