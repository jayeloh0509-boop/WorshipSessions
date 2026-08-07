import { describe, it, expect, afterEach } from 'vitest';
import { parseHash } from '../App';

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

  it('still parses existing routes', () => {
    expect(withHash('#song/42')).toEqual({ view: 'song-view', params: { id: '42' } });
    expect(withHash('').view).toBe('browse');
  });
});
