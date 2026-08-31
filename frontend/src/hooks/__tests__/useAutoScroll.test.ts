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

    act(() => result.current.setSpeed(14));
    expect(result.current.speed).toBe(10);
    expect(localStorage.getItem('worshipsessions-autoscroll-speed')).toBe('10');
  });

  it('falls back when reading storage is blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { result } = renderHook(() => useAutoScroll(true));
    expect(result.current.speed).toBe(0.5);
    getItem.mockRestore();
  });

  it('keeps running until late layout metrics reveal a scrollable chart', () => {
    vi.useFakeTimers();
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        return 2;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    let scrollHeight = 800;
    const scrollElement = document.createElement('div');
    Object.defineProperties(scrollElement, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 800 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    const { result } = renderHook(() => useAutoScroll(true, { current: scrollElement }));

    act(() => result.current.start());
    act(() => frame?.(0));
    expect(result.current.running).toBe(true);

    scrollHeight = 2000;
    act(() => vi.advanceTimersByTime(100));
    act(() => frame?.(1100));
    expect(scrollElement.scrollTop).toBeGreaterThan(0);
    act(() => result.current.pause());
    vi.useRealTimers();
  });

  it('falls back to the page scroll owner when the chart wrapper is not scrollable', () => {
    vi.useFakeTimers();
    const chart = document.createElement('div');
    Object.defineProperties(chart, {
      scrollHeight: { value: 500 },
      clientHeight: { value: 500 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    const page = document.documentElement;
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: page });
    Object.defineProperties(page, {
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 800 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    const { result } = renderHook(() => useAutoScroll(true, { current: chart }));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(1000));
    expect(page.scrollTop).toBeGreaterThan(0);
    act(() => result.current.pause());
    vi.useRealTimers();
  });

  it('accumulates sub-pixel movement at the slowest speed on browsers that round scrollTop', () => {
    vi.useFakeTimers();
    localStorage.setItem('worshipsessions-autoscroll-speed', '1');
    const now = vi.spyOn(performance, 'now');
    let time = 0;
    now.mockImplementation(() => time);
    let roundedTop = 0;
    const scrollElement = document.createElement('div');
    Object.defineProperties(scrollElement, {
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 800 },
      scrollTop: {
        configurable: true,
        get: () => roundedTop,
        set: (value: number) => {
          roundedTop = Math.floor(value);
        },
      },
    });
    const { result } = renderHook(() => useAutoScroll(true, { current: scrollElement }));

    act(() => result.current.start());
    for (let tick = 1; tick <= 100; tick += 1) {
      time = tick * 16;
      act(() => vi.advanceTimersByTime(16));
    }

    expect(scrollElement.scrollTop).toBeGreaterThan(0);
    act(() => result.current.pause());
    now.mockRestore();
    vi.useRealTimers();
  });

  it('scrolls continuously with a timer, cancels promptly, and pauses when disabled', () => {
    vi.useFakeTimers();
    const now = vi.spyOn(performance, 'now');
    let time = 0;
    now.mockImplementation(() => time);
    const scrollElement = document.createElement('div');
    Object.defineProperties(scrollElement, {
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 800 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    const scrollRef = { current: scrollElement };
    const { result, rerender } = renderHook(({ enabled }) => useAutoScroll(enabled, scrollRef), {
      initialProps: { enabled: true },
    });
    act(() => result.current.start());
    expect(result.current.running).toBe(true);
    time = 1000;
    act(() => vi.advanceTimersByTime(50));
    expect(scrollElement.scrollTop).toBeGreaterThan(0);
    expect(result.current.running).toBe(true);

    act(() => scrollElement.dispatchEvent(new WheelEvent('wheel')));
    expect(result.current.running).toBe(false);

    act(() => result.current.start());
    act(() => result.current.pause());
    expect(result.current.running).toBe(false);

    act(() => result.current.start());
    rerender({ enabled: false });
    expect(result.current.running).toBe(false);
    now.mockRestore();
    vi.useRealTimers();
  });
});
