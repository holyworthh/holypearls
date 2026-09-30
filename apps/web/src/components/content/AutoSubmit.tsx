"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Filters apply as soon as a choice changes. Without JavaScript the button
 * submits them instead; with it the button isn't needed and is hidden.
 */
export function AutoSubmit({ label, className }: { label: string; className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    const form = button.current?.form;
    if (!form) return;
    setEnhanced(true);
    const submit = () => form.requestSubmit();
    form.addEventListener("change", submit);
    return () => form.removeEventListener("change", submit);
  }, []);
  return (
    <button ref={button} type="submit" className={className} hidden={enhanced}>
      {label}
    </button>
  );
}
