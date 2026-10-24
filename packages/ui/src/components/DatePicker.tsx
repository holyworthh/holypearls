"use client";

import * as Popover from "@radix-ui/react-popover";
import { useRef, useState, type HTMLAttributes } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { cx } from "../cx";
import { dialogContainer, useCoarsePointer } from "./coarse-pointer";
import field from "./FormField.module.css";
import { CalendarIcon } from "./picker-icons";
import styles from "./Picker.module.css";

type Aria = Pick<HTMLAttributes<HTMLElement>, "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid" | "aria-required">;

export interface DatePickerProps extends Aria {
  /** `yyyy-mm-dd`, or `yyyy-mm-ddThh:mm` with `withTime` (what native date inputs use); "" when empty. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Adds a time to the date, like a native datetime-local input. */
  withTime?: boolean;
  /** Earliest and latest choosable day, `yyyy-mm-dd`. */
  min?: string;
  max?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const DEFAULT_TIME = "09:00";
const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Local calendar day, never shifted by a time zone (new Date("2026-10-24") is UTC midnight). */
function parseDay(text: string | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text ?? "");
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * A date field whose calendar opens under it, lined up with the calendar icon
 * on the right. Touch screens keep the phone's own date picker. Wrap it in
 * FormField for its label, hint and error.
 */
export function DatePicker({ value, defaultValue, onValueChange, withTime, min, max, placeholder = "Choose a date", id, name, disabled, required, className, ...aria }: DatePickerProps) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement>();
  const trigger = useRef<HTMLButtonElement>(null);
  const coarse = useCoarsePointer();
  const current = value ?? inner;
  const day = parseDay(current);
  const time = withTime ? current.slice(11, 16) || DEFAULT_TIME : "";
  const change = (next: string) => {
    setInner(next);
    onValueChange?.(next);
  };
  const pick = (date: Date | undefined) => {
    if (!date) return change("");
    change(withTime ? `${toIso(date)}T${time}` : toIso(date));
    // A time can still follow, so only a plain date closes the calendar.
    if (!withTime) {
      setOpen(false);
      trigger.current?.focus();
    }
  };

  if (coarse) {
    return (
      <input
        {...aria}
        id={id}
        name={name}
        type={withTime ? "datetime-local" : "date"}
        value={current}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        onChange={(event) => change(event.target.value)}
        className={cx(field.control, className)}
      />
    );
  }

  const first = parseDay(min);
  const last = parseDay(max);
  const blocked: Matcher[] = [...(first ? [{ before: first }] : []), ...(last ? [{ after: last }] : [])];
  const today = new Date();
  const todayAllowed = (!first || toIso(today) >= toIso(first)) && (!last || toIso(today) <= toIso(last));

  const shown = day ? (withTime ? `${DAY.format(day)}, ${time}` : DAY.format(day)) : placeholder;
  // An aria-label must contain the words on screen (WCAG 2.5.3), so it ends with the date shown.
  const named = aria["aria-label"] ? { "aria-label": `${aria["aria-label"]}: ${shown}` } : {};

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setContainer(dialogContainer(trigger.current));
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          {...aria}
          {...named}
          ref={trigger}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-required={required || aria["aria-required"]}
          disabled={disabled}
          data-state={open ? "open" : "closed"}
          className={cx(field.control, styles.trigger, className)}
        >
          <span className={cx(styles.value, !day && styles.placeholder)}>{shown}</span>
          <CalendarIcon />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content
          className={styles.content}
          align="end"
          sideOffset={4}
          collisionPadding={8}
          aria-label={withTime ? "Choose a date and time" : "Choose a date"}
          // The calendar puts focus on the chosen day (or today) itself.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DayPicker
            mode="single"
            autoFocus
            selected={day}
            defaultMonth={day ?? first ?? today}
            onSelect={pick}
            disabled={blocked}
            weekStartsOn={1}
            showOutsideDays
            fixedWeeks
            classNames={{
              root: styles.calendar,
              months: styles.months,
              month_caption: styles.monthCaption,
              caption_label: styles.captionLabel,
              nav: styles.nav,
              button_previous: styles.navButton,
              button_next: styles.navButton,
              month_grid: styles.grid,
              weekday: styles.weekday,
              day: styles.day,
              day_button: styles.dayButton,
              today: styles.today,
              selected: styles.selected,
              outside: styles.outside,
              disabled: styles.disabled,
            }}
          />
          <div className={styles.footer}>
            {withTime ? (
              <input
                type="time"
                aria-label="Time"
                className={cx(field.control, styles.time)}
                value={time}
                disabled={!day}
                onChange={(event) => day && event.target.value && change(`${toIso(day)}T${event.target.value}`)}
              />
            ) : (
              <button type="button" className={styles.textButton} disabled={!todayAllowed} onClick={() => pick(today)}>
                Today
              </button>
            )}
            {required ? null : (
              <button
                type="button"
                className={styles.textButton}
                disabled={!current}
                onClick={() => {
                  change("");
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </Popover.Root>
  );
}
