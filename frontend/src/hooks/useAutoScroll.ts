import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const STORAGE_KEY = 'worshipsessions-autoscroll-speed';
const MIN_SPEED = 1;
const MAX_SPEED = 5;
const DEFAULT_SPEED = 2;
const PIXELS_PER_SECOND = [0, 18, 32, 50, 72, 100];

function loadSpeed(): number {
  try {
    const parsed = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(parsed) && parsed >= MIN_SPEED && parsed <= MAX_SPEED ? parsed : DEFAULT_SPEED;
  } catch {
    return DEFAULT_SPEED;
  }
}

export function useAutoScroll(enabled: boolean, scrollRef: RefObject<HTMLElement | null> = { current: null }) {
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(loadSpeed);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const pause = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
    lastTimeRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!enabled) return;
    const element = scrollRef.current;
    if (!element) return;
    // A chart can be taller than the container even when the browser reports
    // zero metrics during the first render. Start anyway; the RAF will measure
    // the real scroll owner on the next frame.
    setRunning(true);
  }, [enabled, scrollRef]);

  const toggle = useCallback(() => {
    if (running) pause();
    else start();
  }, [pause, running, start]);

  const setSpeed = useCallback((value: number) => {
    const safeValue = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(value)));
    setSpeedState(safeValue);
    try {
      localStorage.setItem(STORAGE_KEY, String(safeValue));
    } catch {
      // Live Mode remains usable when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!enabled) pause();
  }, [enabled, pause]);

  useEffect(() => {
    if (!enabled || !running) return;

    const tick = () => {
      const element = scrollRef.current;
      if (!element) {
        pause();
        return;
      }

      const now = performance.now();
      const previous = lastTimeRef.current ?? now;
      const elapsed = Math.min(100, Math.max(0, now - previous));
      lastTimeRef.current = now;
      const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
      if (maxScroll === 0) return;

      const nextTop = Math.min(maxScroll, element.scrollTop + (PIXELS_PER_SECOND[speed] * elapsed) / 1000);
      element.scrollTop = nextTop;
      if (nextTop >= maxScroll) {
        pause();
        setProgress(100);
      }
    };

    // Use a short timer rather than relying on RAF. Mobile browsers may throttle
    // RAF for scrollable elements while touch scrolling/compositor scrolling is active.
    lastTimeRef.current = performance.now();
    timerRef.current = window.setInterval(tick, 50);
    tick();

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      lastTimeRef.current = null;
    };
  }, [enabled, pause, running, scrollRef, speed]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const pauseForUserInput = (event: Event) => {
      if (!running) return;
      if (event instanceof KeyboardEvent && !['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
      pause();
    };
    const updateProgress = () => {
      const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
      setProgress(maxScroll > 0 ? Math.round((element.scrollTop / maxScroll) * 100) : 100);
    };

    element.addEventListener('wheel', pauseForUserInput, { passive: true });
    element.addEventListener('touchstart', pauseForUserInput, { passive: true });
    document.addEventListener('keydown', pauseForUserInput);
    element.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
    return () => {
      element.removeEventListener('wheel', pauseForUserInput);
      element.removeEventListener('touchstart', pauseForUserInput);
      document.removeEventListener('keydown', pauseForUserInput);
      element.removeEventListener('scroll', updateProgress);
    };
  }, [pause, running, scrollRef]);

  return { running, speed, progress, start, pause, toggle, setSpeed };
}
