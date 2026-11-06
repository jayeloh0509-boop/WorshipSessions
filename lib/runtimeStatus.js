const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function probe(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 2500, windowsHide: true, maxBuffer: 8192 }, (error, stdout) => {
      resolve({ ok: !error, stdout: stdout || '' });
    });
  });
}

async function getRuntimeStatus(root, db) {
  const [python, poppler] = await Promise.all([
    probe(process.env.WORSHIPSESSIONS_PYTHON || 'python', [
      '-c',
      'print("PYTHON_OK", flush=True); import pymupdf; print("PYMUPDF_OK")',
    ]),
    probe('pdftotext', ['-v']),
  ]);
  let quickCheck = 'failed';
  let schemaUserVersion = null;
  try {
    if (db.pragma('quick_check').every((row) => row.quick_check === 'ok')) quickCheck = 'ok';
    schemaUserVersion = db.pragma('user_version', { simple: true });
  } catch {
    /* No SQL/error details are reflected to HTTP responses. */
  }
  return {
    database: { quickCheck, schemaUserVersion },
    pdf: {
      python: python.stdout.includes('PYTHON_OK'),
      pymupdf: python.ok && python.stdout.includes('PYMUPDF_OK'),
      poppler: poppler.ok,
      scripts: ['extract_pdf_text.py', 'render_pdf_pages.py'].every((name) =>
        fs.existsSync(path.join(root, 'scripts', name)),
      ),
    },
    vision: { explicitCommandConfigured: Boolean(process.env.HERMES_CLI_PATH), inferenceTested: false },
  };
}

module.exports = { getRuntimeStatus };
