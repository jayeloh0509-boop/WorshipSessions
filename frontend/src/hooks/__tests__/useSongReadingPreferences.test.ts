import { act, renderHook } from '@testing-library/react';
import { useSongReadingPreferences } from '../useSongReadingPreferences';

const defaults = { fontSize: 0, twoCol: false, chartTone: 'paper' as const };

describe('useSongReadingPreferences', () => {
  beforeEach(() => localStorage.clear());

  it('hydrates a song without writing during initialization', () => {
    localStorage.setItem(
      'cv_song_reading_preferences_v1',
      JSON.stringify({ 7: { transpose: 3, twoCol: true, chartTone: 'dark' } }),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const { result } = renderHook(() => useSongReadingPreferences(7, defaults));

    expect(result.current.preferences).toMatchObject({ transpose: 3, twoCol: true, chartTone: 'dark' });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('persists explicit mutations and makes Nashville reset transpose', () => {
    const { result } = renderHook(() => useSongReadingPreferences(7, defaults));

    act(() => result.current.update({ transpose: 4 }));
    act(() => result.current.update({ nashville: true }));

    expect(result.current.preferences.transpose).toBe(0);
    expect(result.current.preferences.nashville).toBe(true);
    expect(localStorage.getItem('cv_song_reading_preferences_v1')).toContain('"nashville":true');
  });

  it('reloads cleanly when the canonical song id changes', () => {
    localStorage.setItem(
      'cv_song_reading_preferences_v1',
      JSON.stringify({ 7: { fontSize: 2 }, 8: { fontSize: -1, autoFit: true } }),
    );
    const { result, rerender } = renderHook(({ id }) => useSongReadingPreferences(id, defaults), {
      initialProps: { id: 7 },
    });

    expect(result.current.preferences.fontSize).toBe(2);
    rerender({ id: 8 });
    expect(result.current.preferences).toMatchObject({ fontSize: -1, autoFit: true });
  });

  it('keeps UI state sanitized and survives localStorage write failures', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useSongReadingPreferences(7, defaults));

    expect(() => {
      act(() => result.current.update({ fontSize: 999, transpose: -999 }));
    }).not.toThrow();
    expect(result.current.preferences).toMatchObject({ fontSize: 5, transpose: -11 });
    act(() => result.current.update({ chartTone: 'dark' }));
    expect(result.current.preferences).toMatchObject({ fontSize: 5, transpose: -11, chartTone: 'dark' });

    expect(() => act(() => result.current.reset())).not.toThrow();
    setItem.mockRestore();
  });

  it('reset clears only this song and restores supplied defaults', () => {
    const { result } = renderHook(() => useSongReadingPreferences(7, { ...defaults, twoCol: true }));
    act(() => result.current.update({ fontSize: 2, chartTone: 'dark' }));
    act(() => result.current.reset());

    expect(result.current.preferences).toEqual({
      transpose: 0,
      nashville: false,
      fontSize: 0,
      twoCol: true,
      chartTone: 'paper',
      autoFit: false,
    });
    expect(localStorage.getItem('cv_song_reading_preferences_v1')).toBe('{}');
  });
});
