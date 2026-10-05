// Ephemeral "now playing" sessions for setlists.
//
// The setlist owner leads: every navigation is pushed here, and followers
// long-poll for the next change. State lives in memory on purpose. A live
// session is only meaningful while the leader's device is pinging, so a server
// restart simply ends it and nothing needs migrating.

const STALE_MS = 2 * 60 * 1000; // leader pings every ~30s; two minutes of silence ends the session
const MAX_WAIT_MS = 25 * 1000;

const sessions = new Map(); // setlistId -> session
const versions = new Map(); // setlistId -> last version, kept after a session ends
const waiters = new Map(); // setlistId -> Set<{ since, finish }>
let counter = 0;

function nextVersion(setlistId) {
  counter += 1;
  versions.set(setlistId, counter);
  return counter;
}

function isActive(session, now = Date.now()) {
  return !!session && now - session.updatedAt < STALE_MS;
}

function snapshot(setlistId, now = Date.now()) {
  const session = sessions.get(setlistId);
  const version = versions.get(setlistId) || 0;
  if (!isActive(session, now)) return { active: false, version };
  return {
    active: true,
    version,
    host: session.hostName,
    entry_id: session.entryId,
    index: session.index,
    updated_at: new Date(session.updatedAt).toISOString(),
  };
}

function notify(setlistId) {
  const set = waiters.get(setlistId);
  if (!set) return;
  for (const waiter of [...set]) waiter.finish();
}

/** Record the leader's position. Returns the new snapshot. */
function push(setlistId, { hostName, entryId, index }, now = Date.now()) {
  const existing = sessions.get(setlistId);
  const changed = !isActive(existing, now) || existing.entryId !== entryId || existing.index !== index;
  sessions.set(setlistId, { hostName, entryId, index, updatedAt: now });
  if (changed) {
    nextVersion(setlistId);
    notify(setlistId);
  }
  return snapshot(setlistId, now);
}

/** End the session and wake any followers. */
function end(setlistId) {
  if (!sessions.has(setlistId)) return snapshot(setlistId);
  sessions.delete(setlistId);
  nextVersion(setlistId);
  notify(setlistId);
  return snapshot(setlistId);
}

/**
 * Resolve with the current snapshot. Without `since`, or when the caller is
 * behind, answer immediately. Otherwise hold the request open until something
 * changes or the wait times out. `onClose` registers a cleanup hook for the
 * caller (the HTTP request closing).
 */
function wait(setlistId, since, { timeoutMs = MAX_WAIT_MS, onClose } = {}) {
  const current = snapshot(setlistId);
  if (since === undefined || since === null || current.version !== since) return Promise.resolve(current);
  return new Promise((resolve) => {
    const set = waiters.get(setlistId) || new Set();
    waiters.set(setlistId, set);
    let timer = null;
    const waiter = {
      finish() {
        if (timer) clearTimeout(timer);
        set.delete(waiter);
        if (!set.size) waiters.delete(setlistId);
        resolve(snapshot(setlistId));
      },
    };
    timer = setTimeout(() => waiter.finish(), timeoutMs);
    if (timer.unref) timer.unref();
    set.add(waiter);
    if (onClose) onClose(() => waiter.finish());
  });
}

function reset() {
  for (const set of waiters.values()) for (const waiter of [...set]) waiter.finish();
  sessions.clear();
  versions.clear();
  waiters.clear();
}

module.exports = { push, end, wait, snapshot, reset, STALE_MS, MAX_WAIT_MS };
