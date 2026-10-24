"use client";

import * as Popover from "@radix-ui/react-popover";
import * as Radix from "@radix-ui/react-select";
import { Command } from "cmdk";
import { useRef, useState, type HTMLAttributes } from "react";
import { cx } from "../cx";
import { dialogContainer, useCoarsePointer } from "./coarse-pointer";
import field from "./FormField.module.css";
import { Check, ChevronDown, ChevronUp } from "./picker-icons";
import styles from "./Picker.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

type Aria = Pick<HTMLAttributes<HTMLElement>, "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid" | "aria-required">;

export interface SelectProps extends Aria {
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Type to filter, for long lists (countries, states, LGAs). */
  searchable?: boolean;
  id?: string;
  name?: string;
  /** Address fields (country, state) keep browser autofill. */
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

// Radix reserves "" for "nothing chosen", but some lists offer "" as a real choice ("Whole state").
const EMPTY = "\u0000empty";

/**
 * A select with a styled list on desktop and the phone's own picker on touch
 * screens. Wrap it in FormField for its label, hint and error.
 */
export function Select({ options, value, defaultValue, onValueChange, placeholder, searchable, id, name, autoComplete, disabled, required, className, ...aria }: SelectProps) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const [container, setContainer] = useState<HTMLElement>();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const coarse = useCoarsePointer();
  const current = value ?? inner;
  const chosen = options.find((option) => option.value === current);
  const change = (next: string) => {
    setInner(next);
    onValueChange?.(next);
  };
  const opening = (next: boolean) => {
    if (next) setContainer(dialogContainer(trigger.current));
    setOpen(next);
  };

  if (coarse) {
    return (
      <select {...aria} id={id} name={name} autoComplete={autoComplete} disabled={disabled} required={required} value={current} onChange={(event) => change(event.target.value)} className={cx(field.control, field.select, className)}>
        {placeholder && !chosen ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  // A hidden native select carries the form value and lets browser autofill fill the field.
  // An aria-label must contain the words on screen (WCAG 2.5.3), so it ends with the choice shown.
  const named = aria["aria-label"] ? { "aria-label": `${aria["aria-label"]}: ${chosen?.label ?? placeholder ?? ""}` } : {};
  const hidden =
    name || autoComplete ? (
      <select aria-hidden="true" tabIndex={-1} className="hp-visually-hidden" name={name} autoComplete={autoComplete} disabled={disabled} value={current} onChange={(event) => change(event.target.value)}>
        {options.some((option) => option.value === "") ? null : <option value="" />}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ) : null;
  const label = chosen ? <span className={styles.value}>{chosen.label}</span> : <span className={cx(styles.value, styles.placeholder)}>{placeholder ?? ""}</span>;

  if (searchable) {
    return (
      <Popover.Root open={open} onOpenChange={opening}>
        <Popover.Trigger asChild>
          <button
            {...aria}
            {...named}
            ref={trigger}
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-required={required || aria["aria-required"]}
            disabled={disabled}
            data-state={open ? "open" : "closed"}
            className={cx(field.control, styles.trigger, className)}
          >
            {label}
            <ChevronDown className={styles.chevron} />
          </button>
        </Popover.Trigger>
        <Popover.Portal container={container}>
          <Popover.Content className={cx(styles.content, styles.list)} align="start" sideOffset={4} collisionPadding={8}>
            <Command loop>
              <Command.Input className={styles.search} placeholder="Type to search" />
              <Command.List className={styles.commandList}>
                <Command.Empty className={styles.empty}>No matches</Command.Empty>
                {options.map((option) => (
                  <Command.Item
                    key={option.value}
                    value={`${option.label}\n${option.value}`}
                    data-option-value={option.value}
                    disabled={option.disabled}
                    data-checked={option.value === current}
                    className={styles.item}
                    onSelect={() => {
                      change(option.value);
                      opening(false);
                      trigger.current?.focus();
                    }}
                  >
                    {option.label}
                    {option.value === current ? <Check /> : null}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
        {hidden}
      </Popover.Root>
    );
  }

  const hasEmpty = options.some((option) => option.value === "");
  const toRadix = (next: string) => (next === "" && hasEmpty ? EMPTY : next);
  return (
    <Radix.Root value={toRadix(current)} onValueChange={(next) => change(next === EMPTY ? "" : next)} open={open} onOpenChange={opening} disabled={disabled} required={required}>
      <Radix.Trigger {...aria} {...named} ref={trigger} id={id} className={cx(field.control, styles.trigger, className)}>
        {label}
        <Radix.Icon asChild>
          <ChevronDown className={styles.chevron} />
        </Radix.Icon>
      </Radix.Trigger>
      <Radix.Portal container={container}>
        <Radix.Content className={cx(styles.content, styles.list)} position="popper" align="start" sideOffset={4} collisionPadding={8}>
          <Radix.ScrollUpButton className={styles.scroll}>
            <ChevronUp />
          </Radix.ScrollUpButton>
          <Radix.Viewport className={styles.viewport}>
            {options.map((option) => (
              <Radix.Item key={option.value} value={toRadix(option.value)} data-option-value={option.value} disabled={option.disabled} className={styles.item}>
                <Radix.ItemText>{option.label}</Radix.ItemText>
                <Radix.ItemIndicator>
                  <Check />
                </Radix.ItemIndicator>
              </Radix.Item>
            ))}
          </Radix.Viewport>
          <Radix.ScrollDownButton className={styles.scroll}>
            <ChevronDown />
          </Radix.ScrollDownButton>
        </Radix.Content>
      </Radix.Portal>
      {hidden}
    </Radix.Root>
  );
}
