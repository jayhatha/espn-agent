"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function useWakeLock(): { isActive: boolean } {
  const [isActive, setIsActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  const acquire = useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
        return;
      }
      const sentinel = await navigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setIsActive(true);

      sentinel.addEventListener("release", () => {
        setIsActive(false);
        sentinelRef.current = null;
      });
    } catch {
      // User denied or API not supported — silently ignore
      setIsActive(false);
    }
  }, []);

  useEffect(() => {
    acquire();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        acquire();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, [acquire]);

  return { isActive };
}
