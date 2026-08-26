const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { run } = require('./procRun');
const { hasBracketChord, isChordSymbol } = require('./chordSyntax');

const SECTION_RE =
  /^(?:Intro|Verse|Chorus|Bridge|Interlude|Outro|Pre-?Chorus|Tag|Ending|Instrumental|Refrain)(?:[.\s]*(?:\d+|\(\d+X\)))?$/i;
const SUMMARY_RE =
  /^(?:(?:Original\s+Key:\s*)?([A-G][#b]?)\s*(?:[•·|]\s*(\d+)\s*bpm|\s*\|\s*BPM:\s*(\d+))|.*?Original\s+Key:\s*([A-G][#b]?)(?:\s*\|\s*BPM:\s*(\d+)))/i;
const CREDIT_RE = /^(?:CCLI\b|Copyright|©|\(c\)|\(?\s*(?:BMI|ASCAP|SESAC)\b|Publishing\b|.*\bAll\s+Rights\s+Reserved)/i;
const WRITTEN_BY_RE = /^Written\s+by\s+/i;
const CHORD_RE = /[A-G][#b]?(?:(?:maj|min|m|sus|add|dim|aug|no)\d*|\d+)?(?:\/[A-G][#b]?)?/g;

function normalizeLine(value) {
  const line = String(value || '').trim();
  if (!line) return '';
  if (SECTION_RE.test(line) || /^(?:REPEAT[.]|Final[.]Chord)/i.test(line)) return line.replace(/\./g, ' ');
  if (line.startsWith('|') && line.endsWith('|')) {
    const chords = [...line.matchAll(CHORD_RE)].map((match) => match[0]);
    if (chords.length) return chords.join(' ');
  }
  const chordTokens = line.split(/\s+/).map((token) => token.replace(/^[([]|[)\],.;]+$/g, '').replace(/[.]+$/g, ''));
  if (chordTokens.length && chordTokens.every(isChordSymbol)) return chordTokens.join(' ');
  if ((line.match(/\./g) || []).length >= 2 || /[,;:][.]/.test(line)) {
    const words = line.replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim();
    const chords = [...line.matchAll(CHORD_RE)].map((match) => match[0]);
    if (chords.length && !hasBracketChord(line)) return `[${chords.join('] [')}]`;
    return words;
  }
  return line;
}

function isChordLine(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(isChordSymbol);
}

function looksLikeWorshipTogetherText(rawText) {
  const lines = String(rawText || '')
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean);
  const hasSummary = lines.some((line) => SUMMARY_RE.test(line));
  const hasCopyright = lines.some((line) => CREDIT_RE.test(line));
  return hasSummary && hasCopyright;
}

function convertWorshipTogetherText(rawText) {
  if (!looksLikeWorshipTogetherText(rawText)) {
    throw new Error('PDF text does not match the Worship Together chart format');
  }
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(normalizeLine);
  const title =
    lines.find((line) => line && !SUMMARY_RE.test(line) && !CREDIT_RE.test(line) && !isChordLine(line)) || '';
  const titleIndex = lines.indexOf(title);
  const artist =
    lines
      .slice(titleIndex + 1)
      .find(
        (line) =>
          line &&
          !SUMMARY_RE.test(line) &&
          !SECTION_RE.test(line) &&
          !CREDIT_RE.test(line) &&
          !WRITTEN_BY_RE.test(line) &&
          !isChordLine(line) &&
          !line.includes('|'),
      ) || '';
  const summary = lines.find((line) => SUMMARY_RE.test(line)) || '';
  const summaryMatch = summary.match(SUMMARY_RE);
  const key = summaryMatch?.[1] || summaryMatch?.[4] || '';
  const tempo = summaryMatch?.[2] || summaryMatch?.[3] || summaryMatch?.[5] || '';
  const output = [];
  let pendingChords = null;
  let songStarted = false;
  let footer = false;
  let skippingTopCopyright = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (index === titleIndex || line === artist || SUMMARY_RE.test(line)) continue;
    if (CREDIT_RE.test(line) || WRITTEN_BY_RE.test(line)) {
      if (songStarted) footer = true;
      else skippingTopCopyright = true;
      continue;
    }
    if (footer) continue;
    if (skippingTopCopyright) {
      if (!SECTION_RE.test(line)) continue;
      skippingTopCopyright = false;
    }
    if (!line || line === '.') continue;
    if (/^(?:REPEAT\b|Final Chord)/i.test(line)) {
      if (pendingChords) {
        output.push(pendingChords.map((chord) => `[${chord}]`).join(' '));
        pendingChords = null;
      }
      output.push(line);
      continue;
    }
    if (SECTION_RE.test(line)) {
      songStarted = true;
      if (pendingChords) {
        output.push(pendingChords.map((chord) => `[${chord}]`).join(' '));
        pendingChords = null;
      }
      output.push(line.replace(/\./g, ' '));
      continue;
    }
    if (/\|/.test(line)) {
      const chords = [...line.matchAll(CHORD_RE)].map((match) => match[0]);
      if (chords.length && chords.every(isChordSymbol)) {
        pendingChords = [...(pendingChords || []), ...chords];
        continue;
      }
    }
    if (pendingChords) {
      output.push(`${pendingChords.map((chord) => `[${chord}]`).join(' ')} ${line}`);
      pendingChords = null;
    } else output.push(line);
  }
  if (pendingChords) output.push(pendingChords.map((chord) => `[${chord}]`).join(' '));
  const directives = [
    `{title: ${title}}`,
    artist ? `{artist: ${artist}}` : '',
    key ? `{key: ${key}}` : '',
    tempo ? `{tempo: ${tempo}}` : '',
    '{x_language: en}',
  ].filter(Boolean);
  const content = `${directives.join('\n')}\n\n${output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
  if (!hasBracketChord(content)) throw new Error('No musical chords found in Worship Together PDF text');
  return { title, artist, key, content };
}

async function importWorshipTogetherPdf(buffer, originalName) {
  const safe = `${Date.now()}-${(originalName || 'chart.pdf').replace(/[^\w.-]/g, '_')}`;
  const pdfPath = path.join(os.tmpdir(), safe);
  await fs.writeFile(pdfPath, buffer);
  try {
    const { stdout } = await run(
      process.env.WORSHIPSESSIONS_PYTHON || 'python',
      [path.join(__dirname, '..', 'scripts', 'extract_pdf_text.py'), pdfPath, '--worship-text'],
      { timeoutMs: 20_000 },
    );
    return convertWorshipTogetherText(stdout);
  } finally {
    fs.unlink(pdfPath).catch(() => {});
  }
}

module.exports = { convertWorshipTogetherText, importWorshipTogetherPdf, looksLikeWorshipTogetherText };
