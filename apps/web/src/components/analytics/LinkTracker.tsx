"use client";

import { siteEventFor } from "@holypearls/contracts";
import { useEffect } from "react";
import { sendBeacon } from "../../lib/beacon";

/**
 * Analytics (PRD-01 §11): counts clicks on links to products, categories,
 * projects, Start a Project and contact, and whether they came from a guide.
 * Only the kind and that one flag are sent, never a path, query or referrer.
 */
export function LinkTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.origin !== location.origin) return;
      const entry = siteEventFor(location.pathname, link.pathname);
      if (!entry) return;
      sendBeacon("/api/v1/analytics/events", entry);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
