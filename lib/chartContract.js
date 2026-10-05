const { isChordSymbol } = require('./chordSyntax');

const SECTION_LABEL_RE = /^(?:intro|verse|alt verse|pre-?chorus|chorus|half-chorus|bridge|interlude|instrumental|vamp|tag|outro|ending|refrain|break|solo)\s*\d*:?$/i;
const CHORD_TOKEN_RE = /\[([^\]]+)\]/g;

function lineKind(line) {
  const text = String(line || '');
  const trimmed = text.trim();
  if (!trimmed) return 'blank';
  if (/^\{[^}]+\}$/.test(trimmed)) return 'metadata';
  if (SECTION_LABEL_RE.test(trimmed)) return 'section';
  const chords = [...text.matchAll(CHORD_TOKEN_RE)].map((m) => m[1]).filter(isChordSymbol);
  if (chords.length && text.replace(CHORD_TOKEN_RE, '').trim() === '') return 'chord-only';
  if (chords.length) return 'lyric-with-chords';
  return 'lyrics';
}

function inspectChart(content) {
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  const warnings = [];
  let sections = 0;
  let chordLines = 0;
  let lyricLines = 0;
  lines.forEach((line, index) => {
    const kind = lineKind(line);
    if (kind === 'section') sections += 1;
    if (kind === 'chord-only' || kind === 'lyric-with-chords') chordLines += 1;
    if (kind === 'lyrics' || kind === 'lyric-with-chords') lyricLines += 1;
    if (kind === 'chord-only' && index + 1 >= lines.length) warnings.push({ line: index + 1, code: 'orphan-chords', message: 'Chord line has no following lyric line.' });
    if (kind === 'lyrics' && index > 0 && line.trim() && lineKind(lines[index - 1]) === 'lyrics') warnings.push({ line: index + 1, code: 'unattached-lyrics', message: 'Lyric line has no detected chord context.' });
  });
  if (!sections) warnings.push({ line: 1, code: 'missing-sections', message: 'No standard section labels were detected.' });
  if (!chordLines) warnings.push({ line: 1, code: 'missing-chords', message: 'No usable chord lines were detected.' });
  return { lineCount: lines.length, sections, chordLines, lyricLines, warnings, status: warnings.length ? 'needs-review' : 'verified' };
}

module.exports = { inspectChart, lineKind };
