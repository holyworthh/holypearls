"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 30_000;
const WATCH_FOR_MS = 10 * 60_000;

/**
 * Refresh rules (PRD-00 §12): refresh when the tab regains focus, and check at
 * most every 30 seconds only while the customer is actively waiting: the tab
 * is visible and they've been on the page for less than ten minutes.
 */
export function OrderRefresh({ waiting }: { waiting: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const onFocus = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = waiting
      ? setInterval(() => {
          if (Date.now() - started > WATCH_FOR_MS) return;
          if (document.visibilityState === "visible") router.refresh();
        }, EVERY_MS)
      : null;
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      if (timer) clearInterval(timer);
    };
  }, [router, waiting]);
  return null;
}
