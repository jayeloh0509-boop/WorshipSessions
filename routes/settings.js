const express = require('express');
const User = require('../lib/models/user');
const { requireAuth } = require('../lib/auth');
const { validatePreferredLanguages } = require('../lib/validation');

function createSettingsRouter() {
  const router = express.Router();

  router.get('/settings/languages', requireAuth, (req, res) => {
    const user = User.getFullById(req.user.id);
    const languages = user?.preferred_languages ? user.preferred_languages.split(',').filter(Boolean) : [];
    res.json({ languages });
  });

  router.put('/settings/languages', requireAuth, (req, res) => {
    const { languages } = req.body;
    const error = validatePreferredLanguages(languages || []);
    if (error) return res.status(400).json({ error });
    const value = languages.length > 0 ? languages.join(',') : null;
    User.updatePreferredLanguages(req.user.id, value);
    res.json({ success: true });
  });

  return router;
}

module.exports = { createSettingsRouter };
