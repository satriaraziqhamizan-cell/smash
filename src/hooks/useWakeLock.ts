import { useEffect, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

/**
 * Menjaga layar HP tetap menyala selama papan skor aktif digunakan memakai Screen Wake Lock API.
 */
export function useWakeLock(active: boolean) {
  const [isLocked, setIsLocked] = useState(false);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!supported || !active) {
      setIsLocked(false);
      return;
    }

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const requestLock = async () => {
      try {
        const nav = navigator as unknown as {
          wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        };
        const lock = await nav.wakeLock.request('screen');
        if (cancelled) {
          await lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        setIsLocked(true);
        lock.addEventListener?.('release', () => {
          if (!cancelled) setIsLocked(false);
        });
      } catch {
        setIsLocked(false);
      }
    };

    requestLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && active && (!sentinel || sentinel.released)) {
        requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (sentinel && !sentinel.released) {
        sentinel.release().catch(() => {});
      }
      setIsLocked(false);
    };
  }, [active, supported]);

  return { isLocked, supported };
}
