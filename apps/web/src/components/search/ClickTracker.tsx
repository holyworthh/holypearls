"use client";

import { useEffect } from "react";
import { sendBeacon } from "../../lib/beacon";

/**
 * Search analytics (PRD-01 §11): which result was chosen. Listens for clicks
 * on links inside a result and sends the result's type, slug and position
 * with a beacon, so leaving the page isn't delayed. No personal details.
 */
export function ClickTracker({ q }: { q: string }) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest("a");
      const result = link?.closest<HTMLElement>("[data-result-type]");
      if (!link || !result) return;
      sendBeacon("/api/v1/search/clicks", { q, type: result.dataset.resultType, slug: result.dataset.resultSlug ?? "", position: Number(result.dataset.resultPosition ?? 0) });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [q]);
  return null;
}
