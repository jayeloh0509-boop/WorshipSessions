import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const STORAGE_KEY = 'worshipsessions-autoscroll-speed';
const MIN_SPEED = 0.1;
const DEFAULT_SPEED = 0.5;
const PIXELS_PER_SECOND_AT_1X = 10;

function clampSpeed(value: number, maxSpeed: number): number {
  const clamped = Math.min(maxSpeed, Math.max(MIN_SPEED, value));
  return Math.round(clamped * 10) / 10;
}

function loadSpeed(maxSpeed: number): number {
  try {
    const parsed = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(parsed) ? clampSpeed(parsed, maxSpeed) : clampSpeed(DEFAULT_SPEED, maxSpeed);
  } catch {
    return clampSpeed(DEFAULT_SPEED, maxSpeed);
  }
}

export function useAutoScroll(
  enabled: boolean,
  scrollRef: RefObject<HTMLElement | null> = { current: null },
  maxSpeed = 10,
) {
  const safeMaxSpeed = Math.min(10, Math.max(MIN_SPEED, maxSpeed));
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(() => loadSpeed(safeMaxSpeed));
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const preciseTopRef = useRef<number | null>(null);

  const pause = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
    lastTimeRef.current = null;
    preciseTopRef.current = null;
  }, []);

  const getScrollOwner = useCallback((): HTMLElement | null => {
    const chart = scrollRef.current;
    if (!chart) return null;
    const chartMaxScroll = Math.max(0, chart.scrollHeight - chart.clientHeight);
    if (chartMaxScroll > 0) return chart;
    const page = document.scrollingElement;
    return page && page.scrollHeight > page.clientHeight ? (page as HTMLElement) : chart;
  }, [scrollRef]);

  const start = useCallback(() => {
    if (!enabled) return;
    const element = getScrollOwner();
    if (!element) return;
    // A chart can be taller than the container even when the browser reports
    // zero metrics during the first render. Start anyway; the timer will measure
    // the real scroll owner on its next tick.
    preciseTopRef.current = element.scrollTop;
    setRunning(true);
  }, [enabled, getScrollOwner]);

  const toggle = useCallback(() => {
    if (running) pause();
    else start();
  }, [pause, running, start]);

  const setSpeed = useCallback(
    (value: number) => {
      const safeValue = clampSpeed(value, safeMaxSpeed);
      setSpeedState(safeValue);
      try {
        localStorage.setItem(STORAGE_KEY, String(safeValue));
      } catch {
        // Live Mode remains usable when storage is unavailable.
      }
    },
    [safeMaxSpeed],
  );

  useEffect(() => {
    if (!enabled) pause();
  }, [enabled, pause]);

  useEffect(() => {
    if (!enabled || !running) return;

    const tick = () => {
      const element = getScrollOwner();
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

      const baseTop = preciseTopRef.current ?? element.scrollTop;
      const nextTop = Math.min(maxScroll, baseTop + (PIXELS_PER_SECOND_AT_1X * speed * elapsed) / 1000);
      preciseTopRef.current = nextTop;
      element.scrollTop = nextTop;
      if (nextTop >= maxScroll) {
        pause();
        setProgress(100);
      }
    };

    // A 16 ms timer keeps movement visually smooth on phones without relying on
    // requestAnimationFrame, which some mobile browsers throttle while idle.
    timerRef.current = window.setInterval(tick, 16);
    tick();

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      lastTimeRef.current = null;
    };
  }, [enabled, getScrollOwner, pause, running, speed]);

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
