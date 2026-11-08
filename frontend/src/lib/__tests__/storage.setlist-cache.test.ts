import { beforeEach, describe, expect, it } from 'vitest';
import { cacheSetlist, clearSetlistCaches, getCachedSetlist } from '../storage';

describe('setlist offline cache', () => {
  beforeEach(() => sessionStorage.clear());

  it('scopes cached setlists to the signed-in account', () => {
    cacheSetlist(7, { name: 'Alice private' }, 1);

    expect(getCachedSetlist<{ name: string }>(7, 1)?.name).toBe('Alice private');
    expect(getCachedSetlist(7, 2)).toBeNull();
    expect(getCachedSetlist(7)).toBeNull();
  });

  it('keeps signed-out and signed-in caches separate', () => {
    cacheSetlist(7, { name: 'Public' });
    cacheSetlist(7, { name: 'Private' }, 1);

    expect(getCachedSetlist<{ name: string }>(7)?.name).toBe('Public');
    expect(getCachedSetlist<{ name: string }>(7, 1)?.name).toBe('Private');
  });

  it('clears every cached setlist without touching other session data', () => {
    cacheSetlist(7, { name: 'A' }, 1);
    cacheSetlist(8, { name: 'B' });
    sessionStorage.setItem('cv_browse_query', 'keep');

    clearSetlistCaches();

    expect(getCachedSetlist(7, 1)).toBeNull();
    expect(getCachedSetlist(8)).toBeNull();
    expect(sessionStorage.getItem('cv_browse_query')).toBe('keep');
  });
});
