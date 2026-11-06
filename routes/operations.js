const express = require('express');
const { requireAuth } = require('../lib/auth');
const { getRuntimeStatus } = require('../lib/runtimeStatus');

function createOperationsRouter({ db, buildInfo, root, runtimeProbe = getRuntimeStatus }) {
  const router = express.Router();
  router.get('/build', (_req, res) => {
    res.set('Cache-Control', 'no-store').json(buildInfo);
  });
  router.get('/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.set('Cache-Control', 'no-store').json({ status: 'ok', database: 'reachable', buildId: buildInfo.buildId });
    } catch {
      res.status(503).set('Cache-Control', 'no-store').json({ status: 'unavailable' });
    }
  });
  let cached;
  let expires = 0;
  router.get('/admin/runtime-status', requireAuth, async (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });
    try {
      if (!cached || Date.now() >= expires) {
        cached = Promise.resolve(runtimeProbe(root, db));
        expires = Date.now() + 30_000;
      }
      const status = await cached;
      return res.set('Cache-Control', 'no-store').json({ ...status, build: buildInfo });
    } catch {
      cached = undefined;
      return res.status(503).json({ error: 'Runtime diagnostics unavailable' });
    }
  });
  return router;
}

module.exports = { createOperationsRouter };
