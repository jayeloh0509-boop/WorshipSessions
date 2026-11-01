const { run } = require('./procRun');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { hasBracketChord } = require('./chordSyntax');

const CHORDPRO_PROMPT = `Transcribe this lawfully downloaded worship chord chart into ChordPro.

Return ONLY ChordPro text. No markdown fences and no explanation.

Rules:
- Preserve every visible lyric exactly. Never invent or paraphrase lyrics.
- Preserve every visible chord exactly, including slash chords and extensions.
- Put each chord directly before the lyric syllable or word it belongs to: [G]word.
- Use {title: }, {artist: }, {key: }, {capo: }, {tempo: } only when visible.
- Always include {x_language: <ISO 639-1 code>}.
- Use {comment: Verse 1}, {comment: Chorus}, {comment: Bridge}, etc. for section labels.
- Bracket each chord on instrumental lines, but preserve all visible barlines, beat/hold slashes and repeat markers, e.g. | [G] / / / | [D/F#] / / / |. Never collapse a measured progression to chord names alone.
- Preserve repeats and song order.
- Mark unreadable text as [?] rather than guessing.
- Do not include copyright notices, page numbers, website navigation, or footer boilerplate.`;

function cleanChordPro(value) {
  const content = String(value || '')
    .replace(/^```(?:chordpro)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  if (!content || !hasBracketChord(content)) throw new Error('Chart recognition returned no usable musical chords');
  return `${content}\n`;
}

async function renderPdfContactSheet(pdfPath, imagePath) {
  const python = process.env.WORSHIPSESSIONS_PYTHON || 'python';
  await run(python, [path.join(__dirname, '..', 'scripts', 'render_pdf_pages.py'), pdfPath, imagePath], {
    timeoutMs: 30_000,
  });
}

async function runHermesVision(imagePath, provider, model) {
  const hermes = process.env.HERMES_CLI_PATH || 'hermes';
  const args = [
    'chat',
    '-Q',
    '--ignore-rules',
    ...(provider ? ['--provider', provider] : []),
    ...(model ? ['--model', model] : []),
    '--toolsets',
    'vision',
    '--image',
    imagePath,
    '--max-turns',
    '1',
    '--source',
    'tool',
    '-q',
    CHORDPRO_PROMPT,
  ];
  const { stdout } = await run(hermes, args, {
    env: { ...process.env, HERMES_YOLO_MODE: '0' },
    timeoutMs: Number(process.env.WORSHIPSESSIONS_VISION_TIMEOUT_MS || 120000),
  });
  const withoutSession = stdout
    .replace(/^session_id:.*$/gm, '')
    .replace(/^⚠️.*$/gm, '')
    .trim();
  return cleanChordPro(withoutSession);
}

function providers() {
  return [
    {
      // Inherit the host's authenticated subscription route and fallback policy.
      // Do not hardcode an obsolete third-party inference service or claim the
      // configured primary is necessarily the upstream that handled fallback.
      id: 'hermes',
      provider: null,
      model: null,
    },
  ];
}

async function importFileWithVision(buffer, originalName, mimeType = 'application/pdf') {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worshipsessions-vision-'));
  const safeName = (originalName || 'chart.pdf').replace(/[^\w.-]/g, '_');
  const sourcePath = path.join(workDir, `source-${safeName}`);
  const isPdf = mimeType === 'application/pdf' || safeName.toLowerCase().endsWith('.pdf');
  const imageExtension = isPdf
    ? '.jpg'
    : { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[mimeType];
  if (!imageExtension) {
    await fs.rm(workDir, { recursive: true, force: true });
    throw new Error('Unsupported image type. Use PNG, JPEG or WebP.');
  }
  const imagePath = path.join(workDir, `chart-pages${imageExtension}`);
  try {
    await fs.writeFile(sourcePath, buffer);
    if (isPdf) {
      await renderPdfContactSheet(sourcePath, imagePath);
    } else {
      await fs.copyFile(sourcePath, imagePath);
    }
    const failures = [];
    for (const candidate of providers()) {
      try {
        const content = await runHermesVision(imagePath, candidate.provider, candidate.model);
        return { content, provider: candidate.id, model: candidate.model || 'host-configured' };
      } catch (error) {
        failures.push(`${candidate.id}: ${error.message}`);
      }
    }
    throw new Error(`Visual chart recognition failed (${failures.join('; ')})`);
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function importPdfWithVision(buffer, originalName) {
  return importFileWithVision(buffer, originalName, 'application/pdf');
}

module.exports = { cleanChordPro, importFileWithVision, importPdfWithVision, providers };
