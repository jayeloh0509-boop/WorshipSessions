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
- Keep chord-only lines as [G] [D] [Em] [C].
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
    '--provider',
    provider,
    '--model',
    model,
    '--image',
    imagePath,
    '--max-turns',
    '2',
    '--source',
    'tool',
    '-q',
    CHORDPRO_PROMPT,
  ];
  const { stdout } = await run(hermes, args, {
    env: { ...process.env, HERMES_YOLO_MODE: '1' },
    timeoutMs: Number(process.env.WORSHIPSESSIONS_VISION_TIMEOUT_MS || 45000),
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
      id: 'theclawbay',
      provider: process.env.WORSHIPSESSIONS_THECLAWBAY_PROVIDER || 'custom:the-claw-bay',
      model: process.env.WORSHIPSESSIONS_THECLAWBAY_MODEL || 'gpt-5.6-sol',
    },
  ];
}

async function importFileWithVision(buffer, originalName, mimeType = 'application/pdf') {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worshipsessions-vision-'));
  const safeName = (originalName || 'chart.pdf').replace(/[^\w.-]/g, '_');
  const sourcePath = path.join(workDir, safeName);
  const imagePath = path.join(workDir, 'chart-pages.jpg');
  await fs.writeFile(sourcePath, buffer);
  try {
    if (mimeType === 'application/pdf' || safeName.toLowerCase().endsWith('.pdf')) {
      await renderPdfContactSheet(sourcePath, imagePath);
    } else {
      await fs.copyFile(sourcePath, imagePath);
    }
    const failures = [];
    for (const candidate of providers()) {
      try {
        const content = await runHermesVision(imagePath, candidate.provider, candidate.model);
        return { content, provider: candidate.id, model: candidate.model };
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
