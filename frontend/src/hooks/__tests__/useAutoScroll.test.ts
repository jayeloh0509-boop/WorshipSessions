import { act, renderHook } from '@testing-library/react';
import { useAutoScroll } from '../useAutoScroll';

describe('useAutoScroll', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  });

  it('restores and persists a sanitized speed preference', () => {
    localStorage.setItem('worshipsessions-autoscroll-speed', '4');
    const { result } = renderHook(() => useAutoScroll(true));
    expect(result.current.speed).toBe(4);

    act(() => result.current.setSpeed(9));
    expect(result.current.speed).toBe(5);
    expect(localStorage.getItem('worshipsessions-autoscroll-speed')).toBe('5');
  });

  it('falls back when reading storage is blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { result } = renderHook(() => useAutoScroll(true));
    expect(result.current.speed).toBe(2);
    getItem.mockRestore();
  });

  it('scrolls on animation frames, cancels promptly, and pauses when disabled', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      const top = typeof options === 'number' ? y : options?.top;
      Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: top ?? 0 });
    });
    window.scrollTo = scrollTo as typeof window.scrollTo;

    const { result, rerender } = renderHook(({ enabled }) => useAutoScroll(enabled), {
      initialProps: { enabled: true },
    });
    act(() => result.current.start());
    act(() => frame?.(100));
    act(() => frame?.(1100));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    expect(result.current.running).toBe(true);

    act(() => window.dispatchEvent(new WheelEvent('wheel')));
    expect(result.current.running).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);

    act(() => result.current.start());
    act(() => result.current.pause());
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(result.current.running).toBe(false);

    act(() => result.current.start());
    rerender({ enabled: false });
    expect(result.current.running).toBe(false);
  });
});
