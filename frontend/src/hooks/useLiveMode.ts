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

function readPersistedActive(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Live Mode remains usable when browser storage is unavailable.
  }
}

export function useLiveMode(targetRef: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(readPersistedActive);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const wakeLockRequestRef = useRef<Promise<boolean> | null>(null);
  const activeRef = useRef(active);

  const requestWakeLock = useCallback(async () => {
    if (wakeLockRef.current) return true;
    if (wakeLockRequestRef.current) return wakeLockRequestRef.current;
    const wakeLock = (navigator as WakeLockCapableNavigator).wakeLock;
    if (!wakeLock || document.visibilityState !== 'visible') return false;
    const request = (async () => {
      try {
        const handle = await wakeLock.request('screen');
        if (!activeRef.current) {
          try {
            await handle.release();
          } catch {
            /* request resolved after Live Mode exited */
          }
          return false;
        }
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
    })();
    wakeLockRequestRef.current = request;
    try {
      return await request;
    } finally {
      if (wakeLockRequestRef.current === request) wakeLockRequestRef.current = null;
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
    activeRef.current = true;
    setActive(true);
    setControlsVisible(false);
    persistActive(true);
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
    activeRef.current = false;
    setActive(false);
    setControlsVisible(false);
    persistActive(false);
    await releaseWakeLock();
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        /* already exited */
      }
    }
  }, [releaseWakeLock]);

  const toggleFullscreen = useCallback(async () => {
    const target = targetRef.current;
    if (!target?.requestFullscreen && !document.fullscreenElement) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await target?.requestFullscreen?.();
    } catch {
      // Fullscreen is optional and may require a fresh user gesture.
    }
  }, [targetRef]);

  useEffect(() => {
    const update = () => setFullscreenActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

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
      activeRef.current = false;
      void releaseWakeLock();
      if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {
          /* fullscreen may already have been exited */
        });
      }
    },
    [releaseWakeLock],
  );

  return {
    active,
    controlsVisible,
    wakeLockActive,
    fullscreenActive,
    toggleFullscreen,
    start,
    stop,
    showControls: () => setControlsVisible(true),
    hideControls: () => setControlsVisible(false),
  };
}
