"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Runs before first paint (in <head>): turns motion on unless the visitor
 * asked for reduced motion. If the reveal script never starts, everything is
 * shown after a moment, so content can't stay hidden.
 */
export const MOTION_BOOT = `(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.dataset.motion='on';setTimeout(function(){if(!window.__hpMotion)delete d.dataset.motion},3000)}catch(e){}})();`;

/*
 * What rises into view as you scroll: section headings, cards in lists and
 * grids, articles, asides, figures and footer blocks. Anything already on
 * screen when the page loads is left alone (it would flicker), as is anything
 * inside a dialog, form, header or navigation.
 */
const CANDIDATES = [
  "main h2",
  "main :is(ul, ol) > li:has(:is(img, article, h3, [style*='background-image']))",
  "main :is(article, aside, figure, details)",
  "main [data-reveal-auto]",
  "footer > div > *",
].join(", ");
const SKIP = "[role='dialog'], dialog, form, header, nav, [data-no-reveal]";

/**
 * Moving content that runs for more than five seconds needs a way to stop it (WCAG 2.2.2). Every ambient
 * animation, the rotating search hint and smooth scrolling follow `data-motion` on the page, so one button
 * turns them all off, and back on unless the visitor asked for reduced motion. It lasts until the page is left.
 */
export function PauseMotion({ className }: { className?: string }) {
  const [paused, setPaused] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable(!matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  if (!available) return null;
  return (
    <button
      type="button"
      className={className}
      aria-pressed={paused}
      onClick={() => {
        const root = document.documentElement;
        if (!paused) delete root.dataset.motion;
        else if (!matchMedia("(prefers-reduced-motion: reduce)").matches) root.dataset.motion = "on";
        setPaused(!paused);
      }}
    >
      Pause motion
    </button>
  );
}

export function Motion() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    (window as unknown as { __hpMotion?: boolean }).__hpMotion = true;
    if (root.dataset.motion !== "on" || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Siblings that arrive together cascade, a beat apart.
        const shown = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement);
        const byParent = new Map<Element | null, HTMLElement[]>();
        for (const element of shown) byParent.set(element.parentElement, [...(byParent.get(element.parentElement) ?? []), element]);
        for (const group of byParent.values())
          group.forEach((element, index) => {
            element.style.setProperty("--hp-reveal-index", String(Math.min(index, 6)));
            element.dataset.revealed = "true";
            observer.unobserve(element);
          });
      },
      // A little below the fold, so things at the very end of the page (shifted down while hidden) still arrive.
      { rootMargin: "0px 0px 32px 0px", threshold: 0 },
    );

    const tag = () => {
      const fold = window.innerHeight;
      for (const element of document.querySelectorAll<HTMLElement>(`${CANDIDATES}, [data-reveal]`)) {
        if (element.dataset.revealed || element.closest(SKIP)) continue;
        if (!element.hasAttribute("data-reveal")) {
          if (element.parentElement?.closest("[data-reveal]")) continue;
          if (element.getBoundingClientRect().top < fold) continue;
          element.setAttribute("data-reveal", "");
        }
        observer.observe(element);
      }
    };
    tag();
    // Content that arrives later (client updates) is picked up too.
    let pending = 0;
    const mutations = new MutationObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(tag);
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(pending);
    };
  }, [pathname]);

  // The header slides away while reading down the page and comes back on the way up (Ledger Motion board).
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.motion !== "on") return;
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < HEADER_HIDE_AFTER) delete root.dataset.scroll;
        else if (Math.abs(y - last) > SCROLL_SLACK) root.dataset.scroll = y > last ? "down" : "up";
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      delete root.dataset.scroll;
    };
  }, []);
  return null;
}

/** The header stays put near the top of the page, and small scroll jitters don't toggle it. */
const HEADER_HIDE_AFTER = 240;
const SCROLL_SLACK = 6;
