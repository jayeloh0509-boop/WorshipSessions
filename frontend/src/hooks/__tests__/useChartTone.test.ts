import { act, renderHook } from '@testing-library/react';
import { useChartTone } from '../useChartTone';

const STORAGE_KEY = 'cv_chart_tone';

describe('useChartTone', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to paper and persists the dark chart preference', () => {
    const { result } = renderHook(() => useChartTone());

    expect(result.current.tone).toBe('paper');

    act(() => result.current.toggleTone());

    expect(result.current.tone).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('restores a persisted dark preference and toggles back to paper', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useChartTone());

    expect(result.current.tone).toBe('dark');

    act(() => result.current.toggleTone());

    expect(result.current.tone).toBe('paper');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('paper');
  });

  it('treats unknown stored values as paper', () => {
    localStorage.setItem(STORAGE_KEY, 'sepia');

    const { result } = renderHook(() => useChartTone());

    expect(result.current.tone).toBe('paper');
  });
});
