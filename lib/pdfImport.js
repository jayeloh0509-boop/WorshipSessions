const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const SECTION_NAMES = ['Verse', 'Chorus', 'Bridge', 'Intro', 'Outro', 'Interlude', 'Pre-Chorus', 'Pre Chorus', 'Ending', 'Tag', 'Coda', 'Break', 'Solo', 'Instrumental', 'Refrain'];
const SECTION_RE = new RegExp(`^\\s*(\\[?\\s*(?:${SECTION_NAMES.join('|')})\\s*\\d*\\s*:?\\]?)\\s*$`, 'i');
const SECTION_CLEAN = /[[\]\s:]/g;
const META_KEY = /(?:^|\s)(key|artist|written by|capo|tempo|bpm)(?:\s*[:=]\s*|\s+)?(.+)$/i;
const CHORD_TOKEN = '[A-G][#b]?(?:(?:maj|min|m|sus|add|dim|aug)\\d*|\\d+)?(?:\\/[A-G][#b]?)?';
const CHORD_TOKEN_RE = new RegExp(`^${CHORD_TOKEN}$`);
const CHORD_IN_LINE_RE = new RegExp(`\\[?(${CHORD_TOKEN})\\]?`, 'g');

async function extractPdfText(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('pdftotext', ['-layout', '-nopgbrk', filePath, '-'], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    proc.on('error', () => reject(new Error('Local PDF extractor (pdftotext) is not available on this server. Install Poppler to enable Worship Together imports.')));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`pdftotext exited with code ${code}: ${stderr || 'unknown error'}`));
      else resolve(stdout.replace(/\r/g, ''));
    });
  });
}

function normalize(value) {
  return value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');
}

function isChordOnlyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const tokens = trimmed
    .replace(/[|,:]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => CHORD_TOKEN_RE.test(token.replace(/^\[|\]$/g, '')));
}

function collapseSpaces(line) {
  return line.replace(/[ \t]+/g, ' ').trimEnd();
}

function interleave(chordLine, lyricLine) {
  const positions = [];
  let match;
  const re = new RegExp(CHORD_IN_LINE_RE.source, 'g');
  while ((match = re.exec(chordLine)) !== null) {
    if (SECTION_RE.test(match[0])) continue;
    positions.push({ chord: match[1], index: match.index });
  }
  if (!positions.length) return lyricLine.trim() ? lyricLine : '';
  const lyrics = lyricLine || '';
  if (!lyrics.trim()) return positions.map(({ chord }) => `[${chord}]`).join(' ');

  // Insert from right to left so each chord-column offset continues to refer to
  // the original lyric line. This preserves the lyric text exactly instead of
  // slicing words and rejoining them with artificial spaces.
  let result = lyrics.trimEnd();
  for (let idx = positions.length - 1; idx >= 0; idx--) {
    const { chord, index } = positions[idx];
    const insertion = Math.max(0, Math.min(index, result.length));
    result = `${result.slice(0, insertion)}[${chord}]${result.slice(insertion)}`;
  }
  return result.trimStart();
}

function deriveMetadata(rawText) {
  const lines = rawText.split('\n').map((line) => collapseSpaces(line)).filter((line) => line.trim());
  let title = '';
  let artist = '';
  let key = '';
  for (const line of lines.slice(0, 20)) {
    const trimmed = line.trim();
    if (!trimmed || SECTION_RE.test(trimmed) || isChordOnlyLine(trimmed)) continue;
    const meta = trimmed.match(META_KEY);
    if (meta) {
      const label = meta[1].toLowerCase();
      const value = meta[2].trim();
      if (label === 'key' && !key) key = value.split(/\s/)[0];
      else if ((label === 'artist' || label === 'written by') && !artist) artist = value;
      continue;
    }
    if (!title && trimmed.length <= 80) {
      title = trimmed;
      continue;
    }
    if (!artist && !title) {
      artist = trimmed;
      continue;
    }
    if (title && !artist && trimmed.length <= 80 && /[a-z]/i.test(trimmed)) {
      artist = trimmed;
    }
  }
  return { title, artist, key };
}

function isCommentLine(line) {
  return SECTION_RE.test(line.trim());
}

function pdfTextToChordPro(rawText) {
  const normalized = normalize(rawText || '');
  if (!normalized.trim()) throw new Error('PDF contained no extractable text');
  const lines = normalized.split('\n').map((line) => collapseSpaces(line));
  const metadata = deriveMetadata(normalized);
  const output = [];
  const directives = [];
  if (metadata.title) directives.push(`{title: ${metadata.title}}`);
  if (metadata.artist) directives.push(`{artist: ${metadata.artist}}`);
  if (metadata.key) directives.push(`{key: ${metadata.key}}`);
  directives.push('{x_language: en}');

  let pendingChordLine = null;
  const skipLines = new Set();
  const headerScan = lines.slice(0, 20);
  let titleSkipped = false;
  let artistSkipped = false;
  for (let idx = 0; idx < headerScan.length; idx++) {
    const trimmed = headerScan[idx].trim();
    if (!trimmed) continue;
    if (SECTION_RE.test(trimmed) || isChordOnlyLine(trimmed)) break;
    if (META_KEY.test(trimmed)) { skipLines.add(idx); continue; }
    if (!titleSkipped && metadata.title && trimmed === metadata.title) {
      skipLines.add(idx);
      titleSkipped = true;
      continue;
    }
    if (!artistSkipped && metadata.artist && trimmed === metadata.artist) {
      skipLines.add(idx);
      artistSkipped = true;
      continue;
    }
    break;
  }

  for (let idx = 0; idx < lines.length; idx++) {
    if (skipLines.has(idx)) continue;
    const rawLine = lines[idx];
    const line = rawLine.trim();
    if (!line) {
      if (pendingChordLine !== null) {
        output.push(interleave(pendingChordLine, ''));
        pendingChordLine = null;
      }
      output.push('');
      continue;
    }
    if (isCommentLine(line)) {
      if (pendingChordLine !== null) {
        output.push(interleave(pendingChordLine, ''));
        pendingChordLine = null;
      }
      output.push(`{comment: ${line.replace(SECTION_CLEAN, ' ').replace(/\s+/g, ' ').trim()}}`);
      continue;
    }
    if (isChordOnlyLine(line)) {
      if (pendingChordLine !== null) output.push(interleave(pendingChordLine, ''));
      pendingChordLine = line;
      continue;
    }
    if (pendingChordLine !== null) {
      output.push(interleave(pendingChordLine, line));
      pendingChordLine = null;
      continue;
    }
    output.push(line);
  }
  if (pendingChordLine !== null) output.push(interleave(pendingChordLine, ''));

  if (!output.some((line) => /\[[A-G]/.test(line))) {
    throw new Error('No chords detected in PDF — try a text-based chart or enable AI OCR in Settings.');
  }

  const content = `${directives.join('\n')}\n\n${output.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  return { title: metadata.title, artist: metadata.artist, key: metadata.key, content };
}

async function importPdfBuffer(buffer, originalName) {
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${(originalName || 'import.pdf').replace(/[^\w.-]/g, '_')}`;
  const tmpPath = path.join(require('os').tmpdir(), safeName);
  await fs.writeFile(tmpPath, buffer);
  try {
    const text = await extractPdfText(tmpPath);
    return pdfTextToChordPro(text);
  } finally {
    fs.unlink(tmpPath).catch(() => {});
  }
}

module.exports = { pdfTextToChordPro, importPdfBuffer, extractPdfText };