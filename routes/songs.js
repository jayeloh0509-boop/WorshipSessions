const express = require('express');
const yazl = require('yazl');
const { requireAuth, requireAdmin, isAdminRole } = require('../lib/auth');
const { STATUS, VISIBILITY, LIMITS } = require('../lib/constants');
const {
  parseId,
  validateSongInput,
  validateVisibility,
  validateLanguage,
  parsePaginationParams,
} = require('../lib/validation');
const { LANGUAGE_CODES } = require('../lib/languages');
const { DEMO_MODE } = require('../lib/demo');
const { makeUniqueNamer } = require('../lib/exportFilename');
const Song = require('../lib/models/song');
const User = require('../lib/models/user');
const { searchPublicCatalog, getPopularSongs, getPublicChart } = require('../lib/publicCatalog');
const { importPdfBuffer } = require('../lib/pdfImport');
const { importWorshipTogetherPdf } = require('../lib/worshipTogetherImport');
const { importFileWithVision, importPdfWithVision } = require('../lib/aiChartImport');
const { AppError } = require('../lib/errors');

function extractDirective(content, name) {
  const re = new RegExp(`\\{${name}:\\s*([^}]*)\\}`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

function extractMetadata(content) {
  const tags = extractDirective(content, 'x_tags');
  const cleanedTags = tags
    ? String(tags)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .join(',')
    : null;
  const bpmStr = extractDirective(content, 'tempo');
  const bpm = bpmStr ? parseInt(bpmStr, 10) : null;
  return {
    title: extractDirective(content, 'title') || '',
    artist: extractDirective(content, 'artist') || '',
    key: extractDirective(content, 'key') || '',
    bpm: bpm && bpm >= 1 && bpm <= 300 ? bpm : null,
    youtube_url: extractDirective(content, 'x_youtube') || null,
    tags: cleanedTags,
    language: extractDirective(content, 'x_language') || '',
  };
}

function resolveCorrectionWithAuth(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid correction ID' });
    return null;
  }
  const correction = Song.findById(id);
  if (!correction || correction.status !== STATUS.PENDING) {
    res.status(404).json({ error: 'Pending correction not found' });
    return null;
  }
  const originalId = correction.parent_id;
  if (!originalId) {
    res.status(400).json({ error: 'Correction has no parent song' });
    return null;
  }
  const original = Song.findById(originalId);
  if (!original) {
    res.status(404).json({ error: 'Original song not found' });
    return null;
  }
  const isOwner = original.user_id === req.user.id;
  if (!isOwner && !isAdminRole(req.user.role)) {
    res.status(403).json({ error: 'Only the song owner or admins can manage corrections' });
    return null;
  }
  return { correction, original, originalId };
}

function createSongsRouter({ withSkipGlobal, exportLimiter }) {
  const router = express.Router();

  router.get('/songs', requireAuth, (req, res) => {
    const { q, language, page, limit } = req.query;
    const userId = req.user.id;
    const { page: pageNum, limit: limitNum } = parsePaginationParams(page, limit);
    res.json(Song.listForUser(userId, { q, language, page: pageNum, limit: limitNum }));
  });

  router.get('/songs/public', requireAuth, (req, res) => {
    const { q, language, page, limit } = req.query;
    const userId = req.user ? req.user.id : 0;
    const { page: pageNum, limit: limitNum } = parsePaginationParams(page, limit);
    res.json(Song.listPublic({ q, language, userId, page: pageNum, limit: limitNum }));
  });

  router.get('/songs/public-catalog/search', requireAuth, async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) return res.status(400).json({ error: 'Search must contain at least 2 characters' });
      res.json({ songs: await searchPublicCatalog(q) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/songs/public-catalog/popular', requireAuth, async (_req, res, next) => {
    try {
      res.json({ songs: await getPopularSongs() });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/songs/import-pdf',
    requireAuth,
    express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: LIMITS.MAX_BODY_JSON }),
    async (req, res, next) => {
      try {
        const body = req.body;
        if (!body || !body.length) return res.status(400).json({ error: 'PDF file is required' });
        const filename = req.headers['x-filename'] || 'worship-together.pdf';
        try {
          let parsed;
          let method = 'local';
          try {
            parsed = await importWorshipTogetherPdf(body, filename);
            method = 'worship-together-text';
          } catch {
            parsed = await importPdfBuffer(body, filename);
          }
          return res.json({
            title: parsed.title,
            artist: parsed.artist,
            key: parsed.key,
            content: parsed.content,
            method,
          });
        } catch (localError) {
          let recognized;
          try {
            recognized = await importPdfWithVision(body, filename);
          } catch (visionError) {
            const timedOut = visionError.code === 'ETIMEDOUT' || /timed out/i.test(visionError.message);
            throw new AppError(
              timedOut
                ? 'Chart recognition timed out. Try a text-based Worship Together PDF or upload fewer pages.'
                : `Could not import this chart: ${visionError.message}`,
              timedOut ? 504 : 422,
              timedOut ? 'CHART_IMPORT_TIMEOUT' : 'CHART_IMPORT_FAILED',
            );
          }
          return res.json({
            title: extractDirective(recognized.content, 'title') || '',
            artist: extractDirective(recognized.content, 'artist') || '',
            key: extractDirective(recognized.content, 'key') || '',
            content: recognized.content,
            method: 'vision',
            provider: recognized.provider,
            model: recognized.model,
            localError: localError.message,
          });
        }
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/songs/import-vision',
    requireAuth,
    express.raw({ type: ['application/pdf', 'application/octet-stream', 'image/*'], limit: LIMITS.MAX_BODY_JSON }),
    async (req, res, next) => {
      try {
        const body = req.body;
        if (!body || !body.length) return res.status(400).json({ error: 'Chart image or PDF is required' });
        const filename = req.headers['x-filename'] || 'chart-upload';
        const mimeType = req.headers['content-type'] || 'application/octet-stream';
        let recognized;
        try {
          recognized = await importFileWithVision(body, filename, mimeType);
        } catch (visionError) {
          const timedOut = visionError.code === 'ETIMEDOUT' || /timed out/i.test(visionError.message);
          throw new AppError(
            timedOut
              ? 'Chart recognition timed out. Try a smaller image or a PDF with fewer pages.'
              : `Could not recognize this chart: ${visionError.message}`,
            timedOut ? 504 : 422,
            timedOut ? 'CHART_IMPORT_TIMEOUT' : 'CHART_IMPORT_FAILED',
          );
        }
        return res.json({
          text: recognized.content,
          language: extractDirective(recognized.content, 'x_language') || 'en',
          provider: recognized.provider,
          model: recognized.model,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/songs/public-catalog/:slug', requireAuth, async (req, res, next) => {
    try {
      res.json(await getPublicChart(req.params.slug));
    } catch (error) {
      next(error);
    }
  });

  router.get('/songs/export', withSkipGlobal(exportLimiter), requireAuth, (req, res) => {
    const isAdmin = isAdminRole(req.user.role);
    const date = new Date().toISOString().slice(0, 10);
    const zip = new yazl.ZipFile();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="worshipsessions-export-${date}.zip"`);
    zip.outputStream.on('error', (err) => {
      console.error('Export zip error:', err.message);
      res.destroy(err);
    });
    zip.outputStream.pipe(res);
    res.on('close', () => {
      if (!res.writableFinished) zip.outputStream.destroy();
    });
    const nameFor = makeUniqueNamer();
    for (const row of Song.iterateExportable(req.user.id, isAdmin)) {
      zip.addBuffer(Buffer.from(row.content, 'utf8'), nameFor(row.title, row.id));
    }
    zip.end();
  });

  router.get('/users/:username/songs', requireAuth, (req, res) => {
    const user = User.findByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { page, limit } = req.query;
    const { page: pageNum, limit: limitNum } = parsePaginationParams(page, limit);
    const songs = Song.listByUser(user.id, { page: pageNum, limit: limitNum });
    res.json(songs);
  });

  router.get('/songs/:id', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid song ID' });
    const song = Song.findById(id);
    if (!song) return res.status(404).json({ error: 'Song not found' });
    if (song.status === STATUS.PENDING) {
      const isSubmitter = req.user && req.user.id === song.user_id;
      const isOriginalOwner = req.user && song.parent_id && Song.findById(song.parent_id)?.user_id === req.user.id;
      const isAdmin = req.user && isAdminRole(req.user.role);
      if (!isSubmitter && !isOriginalOwner && !isAdmin) {
        return res.status(404).json({ error: 'Song not found' });
      }
    }
    if (song.visibility === VISIBILITY.PRIVATE) {
      const isOwner = req.user && req.user.id === song.user_id;
      const isAdmin = req.user && isAdminRole(req.user.role);
      if (!isOwner && !isAdmin) {
        return res.status(404).json({ error: 'Song not found' });
      }
    }
    // Include version_count for single song view
    const userId = req.user ? req.user.id : 0;
    const versionCount = Song.getVersionCount(song.parent_id, song.id, userId);
    res.json({ ...song, version_count: versionCount });
  });

  router.post('/songs', requireAuth, (req, res) => {
    const { content, format_detected, visibility } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });
    if (content.length > LIMITS.MAX_CONTENT)
      return res.status(400).json({ error: `Song content too large (max ${LIMITS.MAX_CONTENT / 1000}KB)` });
    const chordError = validateSongInput({ content, requireChord: true });
    if (chordError) return res.status(400).json({ error: chordError });
    const meta = extractMetadata(content);
    if (!meta.title)
      return res.status(400).json({ error: 'Title is required. Add {title: Song Name} to your content.' });
    if (meta.language) {
      const langError = validateLanguage(meta.language);
      if (langError) return res.status(400).json({ error: langError });
    }
    const visError = validateVisibility(visibility);
    if (visError) return res.status(400).json({ error: visError });

    const fmt = format_detected?.trim() || null;
    const finalVisibility = visibility === VISIBILITY.PRIVATE ? VISIBILITY.PRIVATE : VISIBILITY.PUBLIC;
    const result = Song.create(req.user.id, meta, content, finalVisibility, fmt);
    res.json({ id: result.lastInsertRowid });
  });

  router.post('/songs/import', requireAuth, requireAdmin, (req, res) => {
    const { songs } = req.body;
    if (!Array.isArray(songs)) return res.status(400).json({ error: 'Request body must contain a "songs" array' });
    if (DEMO_MODE && songs.length > LIMITS.DEMO_MAX_IMPORT) {
      return res.status(400).json({ error: `Demo mode: import limited to ${LIMITS.DEMO_MAX_IMPORT} songs` });
    }
    if (songs.length > LIMITS.MAX_IMPORT)
      return res.status(400).json({ error: `Maximum ${LIMITS.MAX_IMPORT} songs per import` });

    const errors = [];
    const valid = [];

    songs.forEach((s, i) => {
      if (!s.content?.trim()) {
        errors.push({ index: i, error: 'Content is required' });
        return;
      }
      if (s.content.length > LIMITS.MAX_CONTENT) {
        errors.push({ index: i, error: `Content too large (max ${LIMITS.MAX_CONTENT / 1000}KB)` });
        return;
      }
      const meta = extractMetadata(s.content);
      if (!meta.title) {
        errors.push({ index: i, error: 'Title is required. Add {title: Song Name} to content.' });
        return;
      }
      if (meta.language && !LANGUAGE_CODES.has(meta.language)) {
        errors.push({ index: i, error: `Invalid language code: ${meta.language}` });
        return;
      }
      const visError = validateVisibility(s.visibility);
      if (visError) {
        errors.push({ index: i, error: visError });
        return;
      }
      valid.push({
        index: i,
        ...meta,
        content: s.content.trim(),
        visibility: s.visibility === VISIBILITY.PRIVATE ? VISIBILITY.PRIVATE : VISIBILITY.PUBLIC,
      });
    });

    try {
      const { imported, skipped } = Song.importSongs(req.user.id, valid);
      res.json({ imported, skipped, errors });
    } catch (e) {
      console.error('Import failed:', e.message);
      res.status(500).json({ error: 'Import failed. Please check your data and try again.' });
    }
  });

  router.put('/songs/:id', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid song ID' });
    const existing = Song.findById(id);
    if (!existing) return res.status(404).json({ error: 'Song not found or not yours' });
    const { content, format_detected, visibility } = req.body;
    const finalContent = content?.trim() || existing.content;
    if (content && content.length > LIMITS.MAX_CONTENT)
      return res.status(400).json({ error: `Song content too large (max ${LIMITS.MAX_CONTENT / 1000}KB)` });
    const chordError = validateSongInput({ content, requireChord: true });
    if (chordError) return res.status(400).json({ error: chordError });
    const meta = extractMetadata(finalContent);
    if (!meta.title)
      return res.status(400).json({ error: 'Title is required. Add {title: Song Name} to your content.' });
    if (meta.language) {
      const langError = validateLanguage(meta.language);
      if (langError) return res.status(400).json({ error: langError });
    }
    const visError = validateVisibility(visibility);
    if (visError) return res.status(400).json({ error: visError });

    const fmt = format_detected !== undefined ? format_detected?.trim() || null : existing.format_detected;
    const finalVisibility =
      visibility !== undefined
        ? visibility === VISIBILITY.PRIVATE
          ? VISIBILITY.PRIVATE
          : VISIBILITY.PUBLIC
        : existing.visibility;
    const isAdmin = isAdminRole(req.user.role);
    const result = Song.update(id, meta, finalContent, finalVisibility, fmt, isAdmin ? null : req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'Song not found or not yours' });
    res.json({ success: true });
  });

  router.delete('/songs/:id', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid song ID' });
    const isAdmin = isAdminRole(req.user.role);
    const result = Song.delete(id, isAdmin ? null : req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'Song not found or not yours' });
    res.json({ success: true });
  });

  router.post('/songs/:id/version', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid song ID' });
    const original = Song.findById(id);
    if (!original || original.status !== STATUS.ACTIVE) return res.status(404).json({ error: 'Song not found' });

    const isOwner = original.user_id === req.user.id;
    const isAdmin = isAdminRole(req.user.role);
    const isPublic = original.visibility === VISIBILITY.PUBLIC;
    if (!isOwner && !isAdmin && !isPublic) return res.status(403).json({ error: 'Not authorized' });

    const { content, youtube_url } = req.body;
    const validationError = validateSongInput({ content, youtube_url, requireContent: true, requireChord: true });
    if (validationError) return res.status(400).json({ error: validationError });

    const parentId = original.parent_id || original.id;
    const meta = extractMetadata(content);
    const result = Song.createVersion(req.user.id, parentId, meta, content, original.visibility);
    res.json({ id: result.lastInsertRowid });
  });

  router.get('/songs/:id/versions', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid song ID' });
    const song = Song.findById(id);
    if (!song || song.status !== STATUS.ACTIVE) return res.status(404).json({ error: 'Song not found' });
    if (song.visibility === VISIBILITY.PRIVATE) {
      const isOwner = req.user && req.user.id === song.user_id;
      const isAdmin = req.user && isAdminRole(req.user.role);
      if (!isOwner && !isAdmin) {
        return res.status(404).json({ error: 'Song not found' });
      }
    }
    const rootId = song.parent_id || song.id;
    const userId = req.user ? req.user.id : 0;
    const versions = Song.getVersions(rootId, userId);
    res.json(versions);
  });

  router.post('/songs/:id/restore-version', requireAuth, (req, res) => {
    const rootId = parseId(req.params.id);
    const versionId = parseId(req.body?.version_id);
    if (!rootId || !versionId) return res.status(400).json({ error: 'Invalid song or version ID' });
    const root = Song.findById(rootId);
    const version = Song.findById(versionId);
    if (!root || !version || root.status !== STATUS.ACTIVE || version.status !== STATUS.ACTIVE) {
      return res.status(404).json({ error: 'Song or version not found' });
    }
    if (root.user_id !== req.user.id || version.user_id !== root.user_id) {
      return res.status(403).json({ error: 'Only the song owner can restore versions' });
    }
    const versionRoot = version.parent_id || version.id;
    const rootRoot = root.parent_id || root.id;
    if (versionRoot !== rootRoot || version.id === root.id) {
      return res.status(400).json({ error: 'Version does not belong to this song' });
    }
    Song.restoreVersion(root.id, version, root.visibility, root.format_detected);
    res.json({ success: true, id: root.id });
  });

  router.post('/songs/:id/correction', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid song ID' });
    const original = Song.findById(id);
    if (!original) return res.status(404).json({ error: 'Song not found' });
    if (original.status === STATUS.PENDING)
      return res.status(400).json({ error: 'Cannot correct a pending correction' });
    if (original.visibility === VISIBILITY.PRIVATE && req.user.id !== original.user_id) {
      return res.status(403).json({ error: 'Cannot submit corrections on private songs' });
    }
    const { content, youtube_url } = req.body;
    const validationError = validateSongInput({ content, youtube_url, requireContent: true, requireChord: true });
    if (validationError)
      return res.status(400).json({ error: validationError.replace('before saving', 'before submitting') });

    const parentId = original.parent_id || original.id;
    const meta = extractMetadata(content);
    const result = Song.createCorrection(req.user.id, parentId, meta, content);
    res.json({ id: result.lastInsertRowid });
  });

  router.get('/songs/:id/corrections', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid song ID' });
    const song = Song.findById(id);
    if (!song) return res.status(404).json({ error: 'Song not found' });
    const isOwner = song.user_id === req.user.id;
    if (!isOwner && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Only the song owner or admins can view corrections' });
    }
    const rootId = song.parent_id || song.id;
    const corrections = Song.getCorrections(rootId);
    res.json(corrections);
  });

  router.put('/corrections/:id/approve', requireAuth, (req, res) => {
    const resolved = resolveCorrectionWithAuth(req, res);
    if (!resolved) return;
    const { correction, originalId } = resolved;
    Song.approveCorrection(correction.id, originalId, correction.content);
    res.json({ success: true });
  });

  router.delete('/corrections/:id', requireAuth, (req, res) => {
    const resolved = resolveCorrectionWithAuth(req, res);
    if (!resolved) return;
    Song.deleteCorrection(resolved.correction.id);
    res.json({ success: true });
  });

  return router;
}

module.exports = { createSongsRouter };
