const { spawn } = require('child_process');

/**
 * Kills a child process and, on Windows, its whole process tree.
 * `proc.kill()` alone only terminates the wrapper executable on Windows,
 * leaving grandchildren (e.g. a Python interpreter) running forever.
 */
function killTree(proc) {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } catch {
      proc.kill();
    }
  } else {
    proc.kill('SIGKILL');
  }
}

/**
 * Runs a command to completion with a hard timeout and closed stdin.
 * stdin is closed so CLIs that prompt interactively fail fast instead of
 * blocking the request forever.
 *
 * @param {string} command - Executable to run
 * @param {string[]} args - Arguments
 * @param {{ timeoutMs?: number, env?: object }} [options]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs = 30_000, ...spawnOptions } = options;
    const proc = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...spawnOptions,
    });
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree(proc);
        }, timeoutMs)
      : null;
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        const err = new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s`);
        err.code = 'ETIMEDOUT';
        reject(err);
      } else if (code === 0) resolve({ stdout, stderr });
      else {
        const err = new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`);
        err.exitCode = code;
        reject(err);
      }
    });
  });
}

module.exports = { run, killTree };
