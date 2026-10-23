"use client";

import { siteEventFor } from "@holypearls/contracts";
import { useEffect } from "react";

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
      const body = JSON.stringify(entry);
      const blob = new Blob([body], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/v1/analytics/events", blob)) {
        void fetch("/api/v1/analytics/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
