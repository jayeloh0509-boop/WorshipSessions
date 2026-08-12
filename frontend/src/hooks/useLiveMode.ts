import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'worshipsessions-live-mode';

type WakeLockHandle = {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockHandle>;
  };
};

export function useLiveMode(targetRef: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');
  const [controlsVisible, setControlsVisible] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);

  const requestWakeLock = useCallback(async () => {
    const wakeLock = (navigator as WakeLockCapableNavigator).wakeLock;
    if (!wakeLock || document.visibilityState !== 'visible') return false;
    try {
      const handle = await wakeLock.request('screen');
      wakeLockRef.current = handle;
      setWakeLockActive(true);
      handle.addEventListener?.('release', () => {
        if (wakeLockRef.current === handle) wakeLockRef.current = null;
        setWakeLockActive(false);
      });
      return true;
    } catch {
      setWakeLockActive(false);
      return false;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const handle = wakeLockRef.current;
    wakeLockRef.current = null;
    setWakeLockActive(false);
    if (handle) {
      try {
        await handle.release();
      } catch {
        /* already released */
      }
    }
  }, []);

  const start = useCallback(async () => {
    setActive(true);
    setControlsVisible(false);
    localStorage.setItem(STORAGE_KEY, '1');
    await requestWakeLock();
    const target = targetRef.current;
    if (target?.requestFullscreen && !document.fullscreenElement) {
      try {
        await target.requestFullscreen();
      } catch {
        /* fullscreen is optional */
      }
    }
  }, [requestWakeLock, targetRef]);

  const stop = useCallback(async () => {
    setActive(false);
    setControlsVisible(false);
    localStorage.removeItem(STORAGE_KEY);
    await releaseWakeLock();
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        /* already exited */
      }
    }
  }, [releaseWakeLock]);

  useEffect(() => {
    if (!active) return;
    void requestWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) void requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [active, requestWakeLock]);

  useEffect(
    () => () => {
      void releaseWakeLock();
    },
    [releaseWakeLock],
  );

  return {
    active,
    controlsVisible,
    wakeLockActive,
    start,
    stop,
    showControls: () => setControlsVisible(true),
    hideControls: () => setControlsVisible(false),
  };
}
