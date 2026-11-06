const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { readBuildIdentity } = require('../../lib/buildIdentity');
const root = path.resolve(__dirname, '../..');

function selectSmokePublicDir(explicit) {
  if (explicit !== undefined) {
    if (!path.isAbsolute(explicit)) throw new Error('WS_QA_PUBLIC_DIR must be an absolute artifact directory');
    const index = path.join(explicit, 'index.html');
    if (!fs.existsSync(index) || !fs.statSync(index).isFile() || fs.statSync(index).size === 0) {
      throw new Error('Built artifact requires a nonempty index.html');
    }
    if (!readBuildIdentity(explicit, root).buildId)
      throw new Error('Built artifact requires a valid build-info.json manifest');
    return { publicDir: explicit, built: true, cleanup() {} };
  }
  const publicDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ws-api-public-'));
  return {
    publicDir,
    built: false,
    cleanup() {
      fs.rmSync(publicDir, { recursive: true, force: true });
    },
  };
}

// Never echo arbitrary child output, paths, messages or environment values.
// Even an unlabeled credential in stderr must not reach a startup exception.
const diagnosticCodes = [
  'ENOENT',
  'EACCES',
  'EPERM',
  'EADDRINUSE',
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  'SQLITE_CANTOPEN',
  'SQLITE_ERROR',
];
function safeDiagnostics(text) {
  return diagnosticCodes.filter((code) => new RegExp(`\\b${code}\\b`).test(text)).join(', ') || '[redacted]';
}

async function startServer({ database = ':memory:', cwd = root, env = {}, spawnProcess = spawn } = {}) {
  const secret = randomBytes(32).toString('hex');
  let child;
  try {
    child = spawnProcess(process.execPath, [path.join(root, 'server.js')], {
      cwd,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: 'test',
        WS_LIVE_VISION: '0',
        DB_PATH: database,
        JWT_SECRET: secret,
        HOST: '127.0.0.1',
        PORT: '0',
        DOTENV_CONFIG_PATH: os.devNull,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // Raw causes can contain credentials; expose only allowlisted codes.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Isolated server spawn failed; spawn=${safeDiagnostics(String(error.code))}`);
  }
  const closed = new Promise((resolve) => child.once('close', resolve));
  let output = '';
  let stderr = '';
  let spawnCode;
  let exitCode;
  let exitSignal;
  try {
    const port = await new Promise((resolve, reject) => {
      let ready = false;
      let failure;
      const diagnosticError = () =>
        new Error(
          `Isolated server ${failure}; spawn=${safeDiagnostics(String(spawnCode))}; exit=${Number.isInteger(exitCode) ? exitCode : 'unknown'}; signal=${Object.hasOwn(os.constants.signals, exitSignal) ? exitSignal : 'none'}; stderr=${safeDiagnostics(stderr)}`,
        );
      const timeout = setTimeout(() => {
        failure = 'startup timed out';
        reject(diagnosticError());
      }, 10000);
      child.once('error', (error) => {
        spawnCode = error.code;
        failure = 'spawn failed';
      });
      child.once('exit', (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        failure ||= 'exited before ready';
      });
      // close follows flushed stdio, so the final bounded stderr is available.
      child.once('close', () => {
        clearTimeout(timeout);
        if (!ready) {
          failure ||= 'closed before ready';
          reject(diagnosticError());
        }
      });
      child.stdout.on('data', (data) => {
        output = (output + data).slice(-8192);
        const match = output.match(/WorshipSessions running on 127\.0\.0\.1:(\d+)/);
        if (match) {
          ready = true;
          clearTimeout(timeout);
          resolve(Number(match[1]));
        }
      });
      child.stderr.on('data', (data) => {
        stderr = (stderr + data).slice(-8192);
      });
    });
    return {
      base: `http://127.0.0.1:${port}`,
      secret,
      async close() {
        if (child.exitCode === null) child.kill();
        await closed;
      },
    };
  } catch (error) {
    child.kill();
    await closed;
    throw error;
  }
}
module.exports = { startServer, selectSmokePublicDir };
