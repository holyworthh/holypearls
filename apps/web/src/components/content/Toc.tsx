"use client";

import { List } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Heading } from "../../lib/rich-text";
import c from "./content.module.css";

/** The section being read: the last heading that has scrolled past the top third of the screen. */
function useCurrent(headings: Heading[]) {
  const [current, setCurrent] = useState(headings[0]?.id ?? "");
  useEffect(() => {
    const elements = headings.map((heading) => document.getElementById(heading.id)).filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) return;
    const update = () => {
      const line = window.innerHeight / 3;
      let now = elements[0]!.id;
      for (const element of elements) if (element.getBoundingClientRect().top <= line) now = element.id;
      setCurrent(now);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [headings]);
  return current;
}

/** Sticky "On this page" (Pen 57): the 2px ink rule marks the section being read. */
export function TocNav({ headings }: { headings: Heading[] }) {
  const current = useCurrent(headings);
  const titleId = useId();
  if (headings.length < 2) return null;
  return (
    <nav className={c.toc} aria-labelledby={titleId}>
      <h2 id={titleId} className={c.tocTitle}>
        On this page
      </h2>
      <ol>
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} aria-current={heading.id === current ? "location" : undefined}>
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Phones (Pen 58): the contents become a jump menu in a bar that stays at the
 * top. Opening it pushes the text down; it never covers it. Picking a section
 * closes it and jumps there.
 */
export function JumpMenu({ headings }: { headings: Heading[] }) {
  const current = useCurrent(headings);
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (headings.length < 2) return null;
  const now = headings.find((heading) => heading.id === current)?.text ?? headings[0]!.text;
  return (
    <div className={c.jump}>
      <button type="button" className={c.jumpBar} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)}>
        <span className={c.jumpLabel}>
          <List size={16} aria-hidden="true" />
          On this page
        </span>
        <span className={c.jumpNow}>{open ? "Close" : now}</span>
      </button>
      <ol id={listId} className={c.jumpList} hidden={!open}>
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} aria-current={heading.id === current ? "location" : undefined} onClick={() => setOpen(false)}>
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
