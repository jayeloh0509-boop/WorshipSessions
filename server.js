// Explicit config selection lets isolated tests avoid loading a real deployment's .env.
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { db } = require('./lib/db');
const { createAuthRouter } = require('./routes/auth');
const { createSongsRouter } = require('./routes/songs');
const { createSetlistsRouter } = require('./routes/setlists');
const { createAdminRouter } = require('./routes/admin');
const { createSettingsRouter } = require('./routes/settings');
const { errorHandler } = require('./lib/errors');
const { LIMITS } = require('./lib/constants');
const { readBuildIdentity } = require('./lib/buildIdentity');
const { createOperationsRouter } = require('./routes/operations');
const publicDir = process.env.WORSHIPSESSIONS_PUBLIC_DIR || path.join(__dirname, 'public');
// Freeze the loaded artifact identity so later file copies cannot disguise a stale process.
const buildInfo = Object.freeze(readBuildIdentity(publicDir, __dirname));

const app = express();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required. Set it in your .env file.');
  process.exit(1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        connectSrc: ["'self'"],
        // Original-file previews use local object URLs; allow those without
        // permitting arbitrary remote image/frame origins.
        imgSrc: ["'self'", 'data:', 'blob:'],
        frameSrc: ["'self'", 'blob:', 'https://challenges.cloudflare.com'],
      },
    },
  }),
);

const { apiRateLimiter, withSkipGlobal, authLimiter, registerLimiter, exportLimiter } = require('./lib/rateLimiter');

app.set('trust proxy', 1);

app.use(express.json({ limit: LIMITS.MAX_BODY_JSON }));
app.use(express.static(publicDir));

app.use('/api/', apiRateLimiter);
app.use('/api', createOperationsRouter({ db, buildInfo, root: __dirname }));

app.use(
  '/api/auth',
  createAuthRouter({
    withSkipGlobal,
    authLimiter,
    registerLimiter,
  }),
);
app.use('/api', createSongsRouter({ withSkipGlobal, exportLimiter }));
app.use('/api', createSetlistsRouter());
app.use('/api', createAdminRouter());
app.use('/api', createSettingsRouter());

app.use(errorHandler);

const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => console.log(`WorshipSessions running on ${HOST}:${server.address().port}`));

let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);
  const forceExit = setTimeout(() => {
    db.close();
    process.exit(1);
  }, 5000);
  server.close(() => {
    clearTimeout(forceExit);
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
