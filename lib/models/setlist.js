const { db } = require('../db');
const { VISIBILITY } = require('../constants');
const { getLikeSearch } = require('../searchUtils');
const { isValidDate } = require('../validation');

// Prepared statements for setlists (static ones)
const findByIdStmt = db.prepare('SELECT * FROM setlists WHERE id = ? AND user_id = ?');
const findPublicByIdStmt = db.prepare(
  'SELECT s.*, u.username FROM setlists s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.visibility = ?',
);

const createStmt = db.prepare('INSERT INTO setlists (user_id, name, visibility, event_date, rehearsal_notes) VALUES (?, ?, ?, ?, ?)');
const updateStmt = db.prepare(
  'UPDATE setlists SET name = ?, visibility = ?, event_date = ?, rehearsal_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
);
const duplicateTransaction = db.transaction((setlistId, userId, name) => {
  const source = db.prepare('SELECT * FROM setlists WHERE id = ? AND user_id = ?').get(setlistId, userId);
  if (!source) return null;
  const created = db.prepare(
    'INSERT INTO setlists (user_id, name, visibility, event_date, rehearsal_notes) VALUES (?, ?, ?, ?, ?)',
  ).run(userId, name, source.visibility, source.event_date, source.rehearsal_notes || '');
  const copySections = db.prepare(`
    INSERT INTO setlist_sections (setlist_id, name, position)
    SELECT ?, name, position FROM setlist_sections WHERE setlist_id = ? ORDER BY position ASC
  `);
  copySections.run(created.lastInsertRowid, setlistId);
  const copyEntries = db.prepare(`
    INSERT INTO setlist_songs
      (setlist_id, song_id, position, transpose, nashville, font, two_col, content_override, performance_key, song_notes, transition_notes, section_id)
    SELECT ?, song_id, position, transpose, nashville, font, two_col, content_override, performance_key, song_notes, transition_notes,
      (SELECT dst.id FROM setlist_sections dst JOIN setlist_sections src ON src.name = dst.name AND src.position = dst.position WHERE dst.setlist_id = ? AND src.setlist_id = ? AND src.id = ss.section_id)
    FROM setlist_songs ss WHERE setlist_id = ? ORDER BY position ASC
  `);
  copyEntries.run(created.lastInsertRowid, created.lastInsertRowid, setlistId, setlistId);
  return { id: created.lastInsertRowid, name };
});
const deleteStmt = db.prepare('DELETE FROM setlists WHERE id = ? AND user_id = ?');

// Setlist songs prepared statements
const getEntriesStmt = db.prepare(`
  SELECT ss.id as entry_id, ss.song_id, ss.position, ss.transpose, ss.nashville, ss.font, ss.two_col, ss.content_override, ss.performance_key, ss.song_notes, ss.transition_notes,
         so.title, so.artist, so.content, so.key, so.youtube_url, so.bpm, so.tags, so.language, so.visibility, so.user_id as song_user_id, u.username,
         ss.section_id, sec.name as section_name,
         CASE WHEN so.id IS NULL THEN 1 ELSE 0 END as is_missing
  FROM setlist_songs ss
  LEFT JOIN songs so ON ss.song_id = so.id
  LEFT JOIN users u ON so.user_id = u.id
  LEFT JOIN setlist_sections sec ON ss.section_id = sec.id
  WHERE ss.setlist_id = ?
  ORDER BY ss.position ASC
`);

const getEntryByIdStmt = db.prepare('SELECT * FROM setlist_songs WHERE id = ? AND setlist_id = ?');

const sectionListStmt = db.prepare('SELECT id, setlist_id, name, position FROM setlist_sections WHERE setlist_id = ? ORDER BY position ASC');
const sectionByIdStmt = db.prepare('SELECT * FROM setlist_sections WHERE id = ? AND setlist_id = ?');
const createSectionStmt = db.prepare('INSERT INTO setlist_sections (setlist_id, name, position) VALUES (?, ?, ?)');
const renameSectionStmt = db.prepare('UPDATE setlist_sections SET name = ? WHERE id = ? AND setlist_id = ?');
const deleteSectionStmt = db.prepare('DELETE FROM setlist_sections WHERE id = ? AND setlist_id = ?');
const updateEntrySectionStmt = db.prepare('UPDATE setlist_songs SET section_id = ? WHERE id = ? AND setlist_id = ?');
const reorderSectionsTransaction = db.transaction((setlistId, sectionIds) => {
  const update = db.prepare('UPDATE setlist_sections SET position = ? WHERE id = ? AND setlist_id = ?');
  sectionIds.forEach((id, index) => update.run(index + 1, id, setlistId));
});

const addSongEntryTransaction = db.transaction((setlistId, songId, transpose, nashville) => {
  const maxPos = db.prepare('SELECT MAX(position) as max FROM setlist_songs WHERE setlist_id = ?').get(setlistId);
  const position = (maxPos.max || 0) + 1;
  const result = db
    .prepare('INSERT INTO setlist_songs (setlist_id, song_id, position, transpose, nashville) VALUES (?, ?, ?, ?, ?)')
    .run(setlistId, songId, position, transpose || 0, nashville ? 1 : 0);
  db.prepare('UPDATE setlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(setlistId);
  return { entry_id: result.lastInsertRowid, position };
});

const updateSongEntryTransaction = db.transaction(
  (
    entryId,
    setlistId,
    entry,
    { transpose, nashville, font, twoCol, contentOverride, performanceKey, songNotes, transitionNotes },
  ) => {
    db.prepare(
      `UPDATE setlist_songs SET
      transpose = COALESCE(?, transpose),
      nashville = COALESCE(?, nashville),
      font = COALESCE(?, font),
      two_col = COALESCE(?, two_col),
      content_override = ?,
      performance_key = ?,
      song_notes = ?,
      transition_notes = ?
      WHERE id = ? AND setlist_id = ?`,
    ).run(
      transpose !== undefined ? transpose : null,
      nashville !== undefined ? (nashville ? 1 : 0) : null,
      font !== undefined ? font : null,
      twoCol !== undefined ? (twoCol === null ? null : twoCol ? 1 : 0) : null,
      contentOverride !== undefined ? contentOverride : entry.content_override,
      performanceKey !== undefined ? performanceKey : entry.performance_key,
      songNotes !== undefined ? songNotes : entry.song_notes,
      transitionNotes !== undefined ? transitionNotes : entry.transition_notes,
      entryId,
      setlistId,
    );
    db.prepare('UPDATE setlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(setlistId);
  },
);

const deleteSongEntryTransaction = db.transaction((entryId, setlistId) => {
  const result = db.prepare('DELETE FROM setlist_songs WHERE id = ? AND setlist_id = ?').run(entryId, setlistId);
  if (result.changes) {
    db.prepare('UPDATE setlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(setlistId);
  }
  return result;
});

const reorderEntriesTransaction = db.transaction((setlistId, entryIds) => {
  const updatePos = db.prepare('UPDATE setlist_songs SET position = ? WHERE id = ? AND setlist_id = ?');
  for (let i = 0; i < entryIds.length; i++) {
    updatePos.run(i + 1, entryIds[i], setlistId);
  }
  db.prepare('UPDATE setlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(setlistId);
});

module.exports = {
  // Read operations
  findById: (id, userId) => findByIdStmt.get(id, userId),
  findPublicById: (id) => findPublicByIdStmt.get(id, VISIBILITY.PUBLIC),
  getEntries: (id) => getEntriesStmt.all(id),
  getEntryById: (entryId, setlistId) => getEntryByIdStmt.get(entryId, setlistId),
  getSections: (setlistId) => sectionListStmt.all(setlistId),
  getSectionById: (sectionId, setlistId) => sectionByIdStmt.get(sectionId, setlistId),
  createSection: (setlistId, name) => {
    const max = db.prepare('SELECT MAX(position) as max FROM setlist_sections WHERE setlist_id = ?').get(setlistId);
    return createSectionStmt.run(setlistId, name, (max.max || 0) + 1);
  },
  renameSection: (sectionId, setlistId, name) => renameSectionStmt.run(name, sectionId, setlistId),
  deleteSection: (sectionId, setlistId) => deleteSectionStmt.run(sectionId, setlistId),
  reorderSections: (setlistId, sectionIds) => {
    reorderSectionsTransaction(setlistId, sectionIds);
    return { success: true };
  },
  updateEntrySection: (entryId, setlistId, sectionId) => updateEntrySectionStmt.run(sectionId, entryId, setlistId),

  listForUser(userId, { q, dateFrom, dateTo, page = null, limit = null } = {}) {
    let selectPart = `
      SELECT s.*, COUNT(ss.id) as song_count
    `;
    let bodyPart = `
      FROM setlists s LEFT JOIN setlist_songs ss ON s.id = ss.setlist_id
      WHERE s.user_id = ?
    `;
    const bodyParams = [userId];
    if (q?.trim()) {
      const search = getLikeSearch(q);
      bodyPart += search.sql;
      bodyParams.push(...search.params);
    }
    if (dateFrom?.trim() && isValidDate(dateFrom.trim())) {
      bodyPart += ' AND COALESCE(s.event_date, DATE(s.created_at)) >= ?';
      bodyParams.push(dateFrom.trim());
    }
    if (dateTo?.trim() && isValidDate(dateTo.trim())) {
      bodyPart += ' AND COALESCE(s.event_date, DATE(s.created_at)) <= ?';
      bodyParams.push(dateTo.trim());
    }

    if (page !== null && limit !== null) {
      const countQuery = `SELECT COUNT(DISTINCT s.id) as count ` + bodyPart;
      const totalCount = db.prepare(countQuery).get(...bodyParams).count;

      const setlistsQuery =
        selectPart + bodyPart + ' GROUP BY s.id ORDER BY s.event_date DESC, s.updated_at DESC LIMIT ? OFFSET ?';
      const offset = (page - 1) * limit;
      const setlists = db.prepare(setlistsQuery).all(...bodyParams, limit, offset);

      return {
        setlists,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      };
    } else {
      const setlistsQuery = selectPart + bodyPart + ' GROUP BY s.id ORDER BY s.event_date DESC, s.updated_at DESC';
      return db.prepare(setlistsQuery).all(...bodyParams);
    }
  },

  listPublic({ q, dateFrom, dateTo, page = null, limit = null } = {}) {
    let selectPart = `
      SELECT s.*, u.username, COUNT(ss.id) as song_count
    `;
    let bodyPart = `
      FROM setlists s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN setlist_songs ss ON s.id = ss.setlist_id
      WHERE s.visibility = ?
    `;
    const bodyParams = [VISIBILITY.PUBLIC];

    if (q?.trim()) {
      const search = getLikeSearch(q);
      bodyPart += search.sql;
      bodyParams.push(...search.params);
    }
    if (dateFrom?.trim() && isValidDate(dateFrom.trim())) {
      bodyPart += ' AND COALESCE(s.event_date, DATE(s.created_at)) >= ?';
      bodyParams.push(dateFrom.trim());
    }
    if (dateTo?.trim() && isValidDate(dateTo.trim())) {
      bodyPart += ' AND COALESCE(s.event_date, DATE(s.created_at)) <= ?';
      bodyParams.push(dateTo.trim());
    }

    if (page !== null && limit !== null) {
      const countQuery = `SELECT COUNT(DISTINCT s.id) as count ` + bodyPart;
      const totalCount = db.prepare(countQuery).get(...bodyParams).count;

      const setlistsQuery =
        selectPart + bodyPart + ' GROUP BY s.id ORDER BY s.event_date DESC, s.updated_at DESC LIMIT ? OFFSET ?';
      const offset = (page - 1) * limit;
      const setlists = db.prepare(setlistsQuery).all(...bodyParams, limit, offset);

      return {
        setlists,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      };
    } else {
      const setlistsQuery =
        selectPart + bodyPart + ' GROUP BY s.id ORDER BY s.event_date DESC, s.updated_at DESC LIMIT 100';
      return db.prepare(setlistsQuery).all(...bodyParams);
    }
  },

  // Write operations
  create: (userId, name, visibility, eventDate, rehearsalNotes = '') => {
    return createStmt.run(userId, name, visibility, eventDate, rehearsalNotes);
  },

  update: (id, userId, name, visibility, eventDate, rehearsalNotes = '') => {
    return updateStmt.run(name, visibility, eventDate, rehearsalNotes, id, userId);
  },

  duplicate: (id, userId, name) => duplicateTransaction(id, userId, name),

  delete: (id, userId) => {
    return deleteStmt.run(id, userId);
  },

  // Setlist songs operations
  addSongEntry: (setlistId, songId, { transpose, nashville }) => {
    return addSongEntryTransaction(setlistId, songId, transpose, nashville);
  },

  updateSongEntry: (entryId, setlistId, entry, updates) => {
    updateSongEntryTransaction(entryId, setlistId, entry, updates);
    return { success: true };
  },

  deleteSongEntry: (entryId, setlistId) => {
    return deleteSongEntryTransaction(entryId, setlistId);
  },

  reorderEntries: (setlistId, entryIds) => {
    reorderEntriesTransaction(setlistId, entryIds);
    return { success: true };
  },
};
