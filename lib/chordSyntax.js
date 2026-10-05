const SECTION_LABEL_RE =
  /^(?:verse|chorus|bridge|intro|outro|interlude|pre-?\s*chorus|ending|tag|coda|break|solo|instrumental|refrain)\s*\d*:?$/i;

// Deliberately accepts common chord extensions while rejecting words such as
// [Chorus] and [Bridge], which both begin with valid note letters.
const CHORD_SYMBOL_RE = /^[A-G](?:#|b)?(?:(?:maj|min|m|sus|add|dim|aug|no)\d*|\d+|[-()+°ø∆Δ#b+])*(?:\/[A-G](?:#|b)?)?$/;

function isChordSymbol(value) {
  const symbol = String(value || '')
    .trim()
    .replace(/\s*\/\s*/g, '/');
  return !!symbol && !SECTION_LABEL_RE.test(symbol) && CHORD_SYMBOL_RE.test(symbol);
}

// Bar notation such as `| E - - - | C#m7 - - - | x2` (optionally wrapped as
// `[| ... |]`). Returns true only when the line contains a real chord symbol,
// so a lone `| - - |` or prose between pipes is not mistaken for a chord line.
const BAR_LINE_RE = /^\s*\[?\s*\|.*\|\s*\]?(?:\s+(?:x|×)\s*\d+|\s+\d+\s*x)?\s*$/i;

function isBarNotationLine(line) {
  const text = String(line || '');
  if (!BAR_LINE_RE.test(text)) return false;
  return text
    .replace(/[[\]|]/g, ' ')
    .split(/\s+/)
    .some((token) => isChordSymbol(token));
}

function hasBracketChord(content) {
  for (const match of String(content || '').matchAll(/\[([^\]]+)\]/g)) {
    if (isChordSymbol(match[1])) return true;
  }
  return String(content || '')
    .split(String.fromCharCode(10))
    .some(isBarNotationLine);
}

module.exports = { isChordSymbol, hasBracketChord, isBarNotationLine };
