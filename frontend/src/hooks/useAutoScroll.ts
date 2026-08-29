import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'worshipsessions-autoscroll-speed';
const MIN_SPEED = 1;
const MAX_SPEED = 5;
const DEFAULT_SPEED = 2;
const PIXELS_PER_SECOND = [0, 10, 18, 28, 40, 54];

function loadSpeed(): number {
  try {
    const parsed = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(parsed) && parsed >= MIN_SPEED && parsed <= MAX_SPEED ? parsed : DEFAULT_SPEED;
  } catch {
    return DEFAULT_SPEED;
  }
}

export function useAutoScroll(enabled: boolean) {
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(loadSpeed);
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const pause = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setRunning(false);
    lastTimeRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (enabled) setRunning(true);
  }, [enabled]);

  const toggle = useCallback(() => {
    if (!enabled) return;
    setRunning((current) => !current);
    lastTimeRef.current = null;
  }, [enabled]);

  const setSpeed = useCallback((value: number) => {
    const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(value)));
    setSpeedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Storage may be unavailable in private or restricted browser contexts.
    }
  }, []);

  useEffect(() => {
    if (!enabled) pause();
  }, [enabled, pause]);

  useEffect(() => {
    if (!running || !enabled) return;

    const tick = (time: number) => {
      const last = lastTimeRef.current ?? time;
      const elapsed = Math.min(100, time - last);
      lastTimeRef.current = time;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const nextTop = Math.min(maxScroll, window.scrollY + (PIXELS_PER_SECOND[speed] * elapsed) / 1000);
      window.scrollTo({ top: nextTop, behavior: 'auto' });
      setProgress(maxScroll > 0 ? Math.round((nextTop / maxScroll) * 100) : 100);
      if (nextTop >= maxScroll) {
        setRunning(false);
        lastTimeRef.current = null;
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTimeRef.current = null;
    };
  }, [enabled, running, speed]);

  useEffect(() => {
    const updateProgress = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      setProgress(maxScroll > 0 ? Math.round((window.scrollY / maxScroll) * 100) : 100);
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    return () => window.removeEventListener('scroll', updateProgress);
  }, []);

  return { running, speed, progress, start, pause, toggle, setSpeed };
}
