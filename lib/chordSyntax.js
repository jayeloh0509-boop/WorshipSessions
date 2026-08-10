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

function hasBracketChord(content) {
  for (const match of String(content || '').matchAll(/\[([^\]]+)\]/g)) {
    if (isChordSymbol(match[1])) return true;
  }
  return false;
}

module.exports = { isChordSymbol, hasBracketChord };
