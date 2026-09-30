"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./tooltip.module.css";

/*
 * Tooltips for icon-only actions, everywhere in the app. Any link or button
 * with an accessible name and no visible text gets one, from its aria-label
 * (or data-tooltip, which also overrides it; data-tooltip="off" opts out).
 * One bubble is shared and kept on screen. It shows on mouse hover after a
 * short pause and on keyboard focus; touch never shows it. The bubble is
 * aria-hidden: the control's own name is what assistive tech reads.
 */

const TARGET = "a, button, [role='button'], summary";
const SHOW_DELAY = 350;
/** Moving between icons soon after one showed switches straight away. */
const SKIP_DELAY = 500;
const GAP = 8;
const EDGE = 8;

function labelFor(element: Element): string | null {
  const explicit = element.getAttribute("data-tooltip");
  if (explicit === "off") return null;
  if (explicit) return explicit;
  if (element.closest("[data-tooltip='off']")) return null;
  const hiddenText = [...element.querySelectorAll(".hp-visually-hidden")].map((node) => node.textContent?.trim()).filter(Boolean).join(" ");
  const name = element.getAttribute("aria-label") || hiddenText;
  if (!name) return null;
  // Only when nothing readable is shown next to the icon.
  const visibleText = [...element.childNodes].some((node) => {
    if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim());
    if (!(node instanceof HTMLElement) || node.getAttribute("aria-hidden") === "true" || node.tagName === "svg") return false;
    if (node.classList.contains("hp-visually-hidden")) return false;
    return Boolean(node.innerText?.trim()) && getComputedStyle(node).display !== "none";
  });
  return visibleText ? null : name;
}

type Tip = { text: string; top: number; left: number; side: "top" | "bottom" };

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const target = useRef<Element | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const lastHidden = useRef(0);
  const shown = useRef(false);

  useEffect(() => {
    const place = (element: Element, text: string) => {
      const rect = element.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom > 48 || rect.top < 48;
      setTip({ text, side: below ? "bottom" : "top", top: below ? rect.bottom + GAP : rect.top - GAP, left: rect.left + rect.width / 2 });
      shown.current = true;
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      target.current = null;
      if (shown.current) lastHidden.current = Date.now();
      shown.current = false;
      setTip(null);
    };
    const show = (element: Element, immediate: boolean) => {
      const text = labelFor(element);
      if (!text) return;
      window.clearTimeout(timer.current);
      target.current = element;
      const quick = immediate || Date.now() - lastHidden.current < SKIP_DELAY;
      if (quick) place(element, text);
      else timer.current = window.setTimeout(() => target.current === element && place(element, text), SHOW_DELAY);
    };

    const over = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const element = (event.target as Element).closest?.(TARGET);
      if (element && element !== target.current) show(element, false);
      else if (!element && target.current) hide();
    };
    const out = (event: PointerEvent) => {
      if (!target.current) return;
      const next = event.relatedTarget as Node | null;
      if (!next || !target.current.contains(next)) hide();
    };
    const focus = (event: FocusEvent) => {
      const element = (event.target as Element).closest?.(TARGET);
      if (element && element.matches(":focus-visible")) show(element, true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, { capture: true });
      window.clearTimeout(timer.current);
    };
  }, []);

  // Keep the bubble inside the viewport once its width is known.
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const element = bubble.current;
    if (!tip || !element) return setShift(0);
    const half = element.offsetWidth / 2;
    const min = EDGE + half;
    const max = window.innerWidth - EDGE - half;
    setShift(Math.min(Math.max(tip.left, min), max) - tip.left);
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      className={`${styles.tip} ${tip.side === "top" ? styles.top : styles.bottom}`}
      style={{ top: tip.top, left: tip.left + shift }}
      aria-hidden="true"
      role="presentation"
    >
      {tip.text}
    </div>
  );
}
