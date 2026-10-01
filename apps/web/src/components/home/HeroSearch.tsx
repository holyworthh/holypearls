"use client";

import { useEffect, useState } from "react";
import { SuggestInput } from "../search/SearchSuggest";

/* Real things people order, rotated in the placeholder to teach what can be searched (Motion board · typing search hint). */
const EXAMPLES = ["staff polo shirts", "conference banners", "business cards", "branded tote bags", "chef jackets", "custom gift boxes"];

/** Rotation interval, matching --hp-motion-typing (2.6 s). */
const EVERY_MS = 2600;

export function HeroSearch({ id, inputClassName }: { id: string; inputClassName?: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % EXAMPLES.length), EVERY_MS);
    return () => window.clearInterval(timer);
  }, []);
  return <SuggestInput id={id} className={inputClassName} placeholder={`Try “${EXAMPLES[index]}”`} label="What do you need made?" />;
}
