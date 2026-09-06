import {
  clearSongReadingPreferences,
  getLocalSetlists,
  getSongReadingPreferences,
  getStoredChartTone,
  getStoredFontSize,
  getStoredTheme,
  removeStoredUser,
  saveLocalSetlists,
  saveSongReadingPreferences,
  setStoredChartTone,
  setStoredFontSize,
  setStoredTheme,
} from '../storage';

const KEY = 'cv_song_reading_preferences_v1';

describe('per-song reading preference storage', () => {
  beforeEach(() => localStorage.clear());

  it('returns safe defaults when absent or malformed', () => {
    expect(getSongReadingPreferences(7)).toEqual({});
    localStorage.setItem(KEY, '{broken');
    expect(getSongReadingPreferences(7)).toEqual({});
  });

  it('falls back safely when localStorage reads and writes throw', () => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    Storage.prototype.removeItem = () => { throw new Error('blocked'); };
    try {
      expect(getStoredTheme()).toBe('dark');
      expect(getStoredChartTone()).toBe('paper');
      expect(getStoredFontSize()).toBe(0);
      expect(getLocalSetlists()).toEqual([]);
      expect(() => setStoredTheme('light')).not.toThrow();
      expect(() => setStoredChartTone('dark')).not.toThrow();
      expect(() => setStoredFontSize(18)).not.toThrow();
      expect(() => saveLocalSetlists([])).not.toThrow();
      expect(() => removeStoredUser()).not.toThrow();
    } finally {
      Storage.prototype.getItem = originalGet;
      Storage.prototype.setItem = originalSet;
      Storage.prototype.removeItem = originalRemove;
    }
  });

  it('merges validated preferences while isolating songs', () => {
    saveSongReadingPreferences(7, { transpose: 2, fontSize: 1, chartTone: 'dark' });
    saveSongReadingPreferences(7, { twoCol: true, autoFit: true });
    saveSongReadingPreferences(8, { nashville: true });

    expect(getSongReadingPreferences(7)).toEqual({
      transpose: 2,
      fontSize: 1,
      chartTone: 'dark',
      twoCol: true,
      autoFit: true,
    });
    expect(getSongReadingPreferences(8)).toEqual({ nashville: true, transpose: 0 });
  });

  it('sanitizes invalid and out-of-range fields', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        7: { transpose: 99, fontSize: -99, chartTone: 'sepia', twoCol: 'yes', autoFit: false },
      }),
    );

    expect(getSongReadingPreferences(7)).toEqual({ transpose: 11, fontSize: -3, autoFit: false });
  });

  it('clears only the selected song', () => {
    saveSongReadingPreferences(7, { twoCol: true });
    saveSongReadingPreferences(8, { chartTone: 'dark' });
    clearSongReadingPreferences(7);

    expect(getSongReadingPreferences(7)).toEqual({});
    expect(getSongReadingPreferences(8)).toEqual({ chartTone: 'dark' });
  });
});
