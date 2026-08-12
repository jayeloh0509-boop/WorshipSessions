const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = './data/worshipsessions.db';
const LEGACY_DB_PATH = './data/' + ['chord', 'vault.db'].join('');

function resolveDatabasePath(envPath = process.env.DB_PATH, cwd = process.cwd()) {
  if (envPath) return envPath;
  const currentPath = path.resolve(cwd, DEFAULT_DB_PATH);
  const legacyPath = path.resolve(cwd, LEGACY_DB_PATH);
  if (!fs.existsSync(currentPath) && fs.existsSync(legacyPath)) {
    fs.mkdirSync(path.dirname(currentPath), { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      const legacy = legacyPath + suffix;
      const current = currentPath + suffix;
      if (fs.existsSync(legacy)) fs.renameSync(legacy, current);
    }
  }
  return currentPath;
}

module.exports = { DEFAULT_DB_PATH, resolveDatabasePath };
