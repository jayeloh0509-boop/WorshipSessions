import { act, renderHook } from '@testing-library/react';
import { useChartTone } from '../useChartTone';

const STORAGE_KEY = 'cv_chart_tone';

describe('useChartTone', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to dark and persists the paper chart preference', () => {
    const { result } = renderHook(() => useChartTone());
    expect(result.current.tone).toBe('dark');
    act(() => result.current.toggleTone());
    expect(result.current.tone).toBe('paper');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('paper');
  });

  it('restores a persisted dark preference and toggles back to paper', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useChartTone());
    expect(result.current.tone).toBe('dark');
    act(() => result.current.toggleTone());
    expect(result.current.tone).toBe('paper');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('paper');
  });

  it('keeps an explicitly saved paper preference on remount', () => {
    localStorage.setItem(STORAGE_KEY, 'paper');
    const first = renderHook(() => useChartTone());
    expect(first.result.current.tone).toBe('paper');
    first.unmount();
    const second = renderHook(() => useChartTone());
    expect(second.result.current.tone).toBe('paper');
  });

  it('treats unknown stored values as dark', () => {
    localStorage.setItem(STORAGE_KEY, 'sepia');
    const { result } = renderHook(() => useChartTone());
    expect(result.current.tone).toBe('dark');
  });
});
