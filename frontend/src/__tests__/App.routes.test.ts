import { describe, it, expect, afterEach } from 'vitest';
import { getAuthSuccessView, getSongLibraryPreviewVariant, parseHash } from '../App';

describe('Song Library preview route gate', () => {
  it('keeps both variants available in development', () => {
    expect(getSongLibraryPreviewVariant('?preview=song-library', true, false)).toBe('clean');
    expect(getSongLibraryPreviewVariant('?preview=song-library-premium', true, false)).toBe('premium');
  });

  it('requires an explicit build-time opt-in for production previews', () => {
    expect(getSongLibraryPreviewVariant('?preview=song-library-premium', false, false)).toBeNull();
    expect(getSongLibraryPreviewVariant('?preview=song-library-premium', false, true)).toBe('premium');
  });

  it('ignores unknown preview query values', () => {
    expect(getSongLibraryPreviewVariant('?preview=unknown', true, false)).toBeNull();
  });

  it('returns to the requested library view after authentication', () => {
    const premiumVariant = getSongLibraryPreviewVariant('?preview=song-library-premium', false, true);
    expect(getAuthSuccessView(premiumVariant)).toBe('my-songs');
    expect(getAuthSuccessView(null)).toBe('browse');
  });
});

function withHash(hash: string) {
  location.hash = hash;
  return parseHash();
}

describe('parseHash tools routes', () => {
  afterEach(() => {
    location.hash = '';
  });

  it('maps #tools to the launcher view', () => {
    expect(withHash('#tools')).toEqual({ view: 'tools', params: {} });
  });

  it('deep-links every tool page', () => {
    expect(withHash('#tools/key-finder')).toEqual({ view: 'tools-key-finder', params: {} });
    expect(withHash('#tools/capo')).toEqual({ view: 'tools-capo', params: {} });
    expect(withHash('#tools/transpose')).toEqual({ view: 'tools-transpose', params: {} });
    expect(withHash('#tools/nashville')).toEqual({ view: 'tools-nashville', params: {} });
    expect(withHash('#tools/relative-keys')).toEqual({ view: 'tools-relative', params: {} });
    expect(withHash('#tools/diatonic')).toEqual({ view: 'tools-diatonic', params: {} });
  });

  it('falls back to the tools launcher for unknown tool hashes', () => {
    expect(withHash('#tools/unknown').view).toBe('tools');
    expect(withHash('#tools/').view).toBe('tools');
  });

  it('distinguishes explicit first-song links from resume links', () => {
    expect(withHash('#setlist/47/play')).toEqual({ view: 'setlist-play', params: { id: '47' } });
    expect(withHash('#setlist/47/play/0')).toEqual({ view: 'setlist-play', params: { id: '47', index: '0' } });
    expect(withHash('#setlist/47/play/1')).toEqual({ view: 'setlist-play', params: { id: '47', index: '1' } });
  });

  it('still parses existing routes', () => {
    expect(withHash('#song/42')).toEqual({ view: 'song-view', params: { id: '42' } });
    expect(withHash('').view).toBe('browse');
  });
});
