import { act, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { useLiveMode } from '../useLiveMode';

const STORAGE_KEY = 'worshipsessions-live-mode';

describe('useLiveMode', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  });

  it('starts live mode, persists the preference and requests wake lock', async () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn(), addEventListener: vi.fn() });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const targetRef = createRef<HTMLElement>();
    targetRef.current = { requestFullscreen } as unknown as HTMLElement;
    const { result } = renderHook(() => useLiveMode(targetRef));

    await act(async () => result.current.start());

    expect(result.current.active).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
    expect(request).toHaveBeenCalledWith('screen');
    expect(requestFullscreen).toHaveBeenCalled();
  });

  it('stops live mode and releases the wake lock', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() }) },
    });
    const targetRef = createRef<HTMLElement>();
    targetRef.current = {} as HTMLElement;
    const { result } = renderHook(() => useLiveMode(targetRef));

    await act(async () => result.current.start());
    await act(async () => result.current.stop());

    expect(result.current.active).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(release).toHaveBeenCalled();
  });

  it('restores the live mode preference on mount', async () => {
    localStorage.setItem(STORAGE_KEY, '1');
    const request = vi.fn().mockResolvedValue({ release: vi.fn(), addEventListener: vi.fn() });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const { result } = renderHook(() => useLiveMode(createRef<HTMLElement>()));

    expect(result.current.active).toBe(true);
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });
});
