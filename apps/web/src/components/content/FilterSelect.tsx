"use client";

import { Select } from "@holypearls/ui";
import { useRef } from "react";
import { flushSync } from "react-dom";

/**
 * One "Sector: All" filter. Choosing a value submits the filter form with it:
 * the hidden select only updates after render, so flush before submitting.
 */
export function FilterSelect({ label, name, value, options, className, selectClassName }: { label: string; name: string; value: string; options: readonly string[]; className?: string; selectClassName?: string }) {
  const box = useRef<HTMLLabelElement>(null);
  const form = () => box.current?.closest("form");
  return (
    <label ref={box} className={className}>
      {label}:
      <Select
        name={name}
        defaultValue={value}
        className={selectClassName}
        options={[{ value: "", label: "All" }, ...options.map((option) => ({ value: option, label: option }))]}
        onValueChange={() => {
          flushSync(() => undefined);
          form()?.requestSubmit();
        }}
      />
    </label>
  );
}
