"use client";

import { type AnswerValue, NOT_SURE, type ProjectQuestion } from "@holypearls/contracts";
import { Checkbox, DatePicker, FormField, TextArea, TextField } from "@holypearls/ui";
import { useEffect, useId, useState } from "react";
import s from "./builder.module.css";

/*
 * One question in the builder (Stage 3.1D §6–9, §29): choice cards with real
 * radio and checkbox semantics, numbers and dates with "I'm not sure yet"
 * (PROJ-FR-002), and plain text. Errors sit beside the field.
 */

interface QuestionProps {
  question: ProjectQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  error?: string;
}

function Errors({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={id} className={s.fieldError}>
      <span className="hp-visually-hidden">Error: </span>
      {error}
    </p>
  ) : null;
}

function Choices({ question, value, onChange, error, multiple }: QuestionProps & { multiple: boolean; question: Extract<ProjectQuestion, { options: unknown }> }) {
  const id = useId();
  const chosen = multiple ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
  const toggle = (option: string) => {
    if (!multiple) return onChange(option);
    if (option === NOT_SURE) return onChange(chosen.includes(NOT_SURE) ? [] : [NOT_SURE]);
    const without = chosen.filter((item) => item !== NOT_SURE);
    onChange(without.includes(option) ? without.filter((item) => item !== option) : [...without, option]);
  };
  return (
    <fieldset className={s.question} aria-describedby={[question.hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}>
      <legend>{question.label}</legend>
      {question.hint ? (
        <p id={`${id}-hint`} className={s.hint}>
          {question.hint}
        </p>
      ) : null}
      <Errors id={`${id}-error`} error={error} />
      <div className={s.options}>
        {question.options.map((option) => (
          <label key={option.value} className={s.option}>
            <input type={multiple ? "checkbox" : "radio"} name={`${id}-${question.key}`} value={option.value} checked={chosen.includes(option.value)} onChange={() => toggle(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function YesNo({ question, value, onChange, error }: QuestionProps) {
  return (
    <Choices
      question={{ key: question.key, kind: "CHOICE", label: question.label, hint: question.hint, options: [{ value: "YES", label: "Yes" }, { value: "NO", label: "No" }, { value: NOT_SURE, label: "I'm not sure yet" }] }}
      value={value}
      onChange={onChange}
      error={error}
      multiple={false}
    />
  );
}

/** A number or a date, with "I'm not sure yet" beside it. The draft keeps what was typed until it's valid. */
function WithNotSure({ question, value, onChange, error }: QuestionProps) {
  const id = useId();
  const notSure = value === NOT_SURE;
  const [text, setText] = useState(typeof value === "number" || (typeof value === "string" && !notSure) ? String(value) : "");
  useEffect(() => {
    if (typeof value === "number" || (typeof value === "string" && value !== NOT_SURE)) setText(String(value));
  }, [value]);
  const isNumber = question.kind === "NUMBER";
  const commit = (next: string) => {
    setText(next);
    if (next === "") return onChange(null);
    if (isNumber) {
      const parsed = Number(next.replaceAll(",", ""));
      if (Number.isInteger(parsed) && parsed >= 0) onChange(parsed);
    } else onChange(next);
  };
  return (
    <div className={s.question}>
      <FormField id={`${id}-input`} label={question.label} hint={question.hint} error={error}>
        {isNumber ? (
          <TextField className={s.numberInput} type="text" inputMode="numeric" value={notSure ? "" : text} disabled={notSure} onChange={(event) => commit(event.target.value)} />
        ) : (
          <DatePicker value={notSure ? "" : text} disabled={notSure} onValueChange={commit} />
        )}
      </FormField>
      <Checkbox id={`${id}-unsure`} label="I'm not sure yet" checked={notSure} onChange={(event) => onChange(event.target.checked ? NOT_SURE : text ? (isNumber ? Number(text) : text) : null)} />
    </div>
  );
}

function Text({ question, value, onChange, error }: QuestionProps & { question: Extract<ProjectQuestion, { kind: "TEXT" }> }) {
  const id = useId();
  const control = question.long ? (
    <TextArea value={typeof value === "string" ? value : ""} maxLength={question.max} rows={4} onChange={(event) => onChange(event.target.value)} />
  ) : (
    <TextField value={typeof value === "string" ? value : ""} maxLength={question.max} onChange={(event) => onChange(event.target.value)} />
  );
  return (
    <div className={s.question}>
      <FormField id={`${id}-text`} label={question.label} hint={question.hint} error={error} optional>
        {control}
      </FormField>
    </div>
  );
}

export function QuestionField(props: QuestionProps) {
  const { question } = props;
  switch (question.kind) {
    case "CHOICE":
      return <Choices {...props} question={question} multiple={false} />;
    case "MULTI":
      return <Choices {...props} question={question} multiple />;
    case "YES_NO":
      return <YesNo {...props} />;
    case "NUMBER":
    case "DATE":
      return <WithNotSure {...props} />;
    case "TEXT":
      return <Text {...props} question={question} />;
  }
}
