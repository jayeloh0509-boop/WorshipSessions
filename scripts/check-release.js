#!/usr/bin/env node
// Keep every gate synchronous: a failure must stop before the next command.
const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const releaseSteps = [
  { name: 'staged-lint', cwd: root, args: [path.join(root, 'node_modules/lint-staged/bin/lint-staged.js')] },
  { name: 'frontend-types', cwd: frontend, args: [path.join(frontend, 'node_modules/typescript/bin/tsc'), '-b'] },
  { name: 'frontend-tests', cwd: frontend, args: [path.join(frontend, 'node_modules/vitest/vitest.mjs'), 'run'] },
  {
    name: 'backend-tests', cwd: root,
    args: ['--test', ...readdirSync(path.join(root, 'test')).filter((file) => file.endsWith('.test.js')).sort().map((file) => path.join(root, 'test', file))],
  },
];

function runReleaseChecks({ runner = spawnSync, log = console.error } = {}) {
  for (const step of releaseSteps) {
    log(`[release] ${step.name}`);
    try {
      const result = runner(process.execPath, step.args, {
        cwd: step.cwd, shell: false, stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test', DB_PATH: ':memory:', WS_LIVE_VISION: '0',
          DOTENV_CONFIG_PATH: require('node:os').devNull,
          JWT_SECRET: randomBytes(32).toString('hex'),
        },
      });
      if (!result || result.error || result.signal || result.status !== 0) {
        log(`[release] ${step.name} failed${result?.error ? `: ${result.error.message}` : ''}`);
        return Number.isInteger(result?.status) && result.status > 0 && result.status <= 255 ? result.status : 1;
      }
    } catch (error) {
      log(`[release] ${step.name} could not run: ${error.message}`);
      return 1;
    }
  }
  return 0;
}

module.exports = { runReleaseChecks, releaseSteps };
if (require.main === module) process.exitCode = runReleaseChecks();
