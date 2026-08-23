const { db } = require('../db');

const listStmt = db.prepare(`
  SELECT c.*, u.username AS created_by_username, u2.username AS updated_by_username
  FROM changelog_entries c
  LEFT JOIN users u ON c.created_by = u.id
  LEFT JOIN users u2 ON c.updated_by = u2.id
  ORDER BY COALESCE(c.published_at, c.updated_at) DESC, c.id DESC
`);
const getStmt = db.prepare(`
  SELECT c.*, u.username AS created_by_username, u2.username AS updated_by_username
  FROM changelog_entries c
  LEFT JOIN users u ON c.created_by = u.id
  LEFT JOIN users u2 ON c.updated_by = u2.id
  WHERE c.id = ?
`);
const insertStmt = db.prepare(`
  INSERT INTO changelog_entries (version, title, summary, body, created_by, updated_by)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE changelog_entries
  SET version = ?, title = ?, summary = ?, body = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND status = 'draft'
`);
const publishStmt = db.prepare(`
  UPDATE changelog_entries
  SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const unpublishStmt = db.prepare(`
  UPDATE changelog_entries
  SET status = 'draft', published_at = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const deleteStmt = db.prepare('DELETE FROM changelog_entries WHERE id = ?');

module.exports = {
  list: () => listStmt.all(),
  get: (id) => getStmt.get(id),
  create: (data, userId) => {
    const result = insertStmt.run(data.version, data.title, data.summary, data.body, userId, userId);
    return getStmt.get(result.lastInsertRowid);
  },
  update: (id, data, userId) => {
    const result = updateStmt.run(data.version, data.title, data.summary, data.body, userId, id);
    return result.changes ? getStmt.get(id) : null;
  },
  publish: (id, userId) => {
    const result = publishStmt.run(userId, id);
    return result.changes ? getStmt.get(id) : null;
  },
  unpublish: (id, userId) => {
    const result = unpublishStmt.run(userId, id);
    return result.changes ? getStmt.get(id) : null;
  },
  delete: (id) => deleteStmt.run(id),
};
