const test = require('node:test');
const assert = require('node:assert/strict');
const Changelog = require('../lib/models/changelog');
const User = require('../lib/models/user');

function uniqueUser(suffix) {
  const name = `changelog_${suffix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const result = User.create(name, 'test-hash', 'admin');
  return { id: Number(result.lastInsertRowid), name };
}

test('changelog model supports draft, publish, unpublish, and protected published content flow', () => {
  const user = uniqueUser('workflow');
  const data = { version: 'v-test', title: 'Test release', summary: 'Summary', body: 'Details' };
  const created = Changelog.create(data, user.id);
  assert.equal(created.status, 'draft');
  const published = Changelog.publish(created.id, user.id);
  assert.equal(published.status, 'published');
  assert.ok(published.published_at);
  const unpublished = Changelog.unpublish(created.id, user.id);
  assert.equal(unpublished.status, 'draft');
  assert.equal(unpublished.published_at, null);
  const updated = Changelog.update(created.id, { ...data, title: 'Updated' }, user.id);
  assert.equal(updated.title, 'Updated');
  Changelog.delete(created.id);
  User.delete(user.id);
});
