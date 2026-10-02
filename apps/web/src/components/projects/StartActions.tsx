"use client";

import {
  FIGURE_IT_OUT,
  PROJECT_STEPS,
  PROJECT_TYPE_INFO,
  projectResumeSchema,
  projectSchema,
  type ProjectType,
  suggestProjectTypes,
} from "@holypearls/contracts";
import { ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { z } from "zod";
import { api } from "../../lib/api";
import s from "./start.module.css";

/** Starts a draft (POST /v1/projects) and opens its first step. */
function useStart() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const start = async (key: string, body: { type: ProjectType; description?: string }) => {
    setBusy(key);
    setFailed(false);
    try {
      const project = await api("/v1/projects", { method: "POST", body, response: projectSchema });
      router.push(`/start/${project.id}/project`);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };
  return { busy, failed, start };
}

const failedText = "We couldn't start your project. Check your connection and try again.";

/** "Continue your Event branding project — Recommendations" (Stage 3.1D §17). */
export function ResumeBanner() {
  const [current, setCurrent] = useState<z.infer<typeof projectResumeSchema>>(null);
  useEffect(() => {
    api("/v1/projects/current", { response: z.object({ project: projectResumeSchema }) })
      .then((result) => setCurrent(result.project))
      .catch(() => setCurrent(null));
  }, []);
  if (!current) return null;
  const step = PROJECT_STEPS.find((item) => item.key === current.step)!;
  const name = current.title || PROJECT_TYPE_INFO[current.type].label;
  return (
    <div className={s.resume} role="region" aria-label="Your saved project">
      <p className={s.resumeText}>
        Continue your {name} project — {step.label}
      </p>
      <a className={s.outlineButton} href={`/start/${current.id}/${step.slug}`}>
        Continue
        <ArrowRight size={16} aria-hidden="true" />
      </a>
    </div>
  );
}

/** "Help me figure it out" (Stage 3.1D §21): two questions, then suggested project types the customer can still change. */
export function FigureItOut() {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const { busy, failed, start } = useStart();
  const suggestions = who || goal ? suggestProjectTypes(who, goal) : [];

  if (!open) {
    return (
      <button type="button" className={s.brickButton} onClick={() => setOpen(true)}>
        Start the questions
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className={s.figureForm}>
      <fieldset>
        <legend>Who is it for?</legend>
        {FIGURE_IT_OUT.who.map((option) => (
          <label key={option.value} className={s.chip}>
            <input type="radio" name="who" value={option.value} checked={who === option.value} onChange={() => setWho(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>What are you trying to do?</legend>
        {FIGURE_IT_OUT.goal.map((option) => (
          <label key={option.value} className={s.chip}>
            <input type="radio" name="goal" value={option.value} checked={goal === option.value} onChange={() => setGoal(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      {suggestions.length ? (
        <div aria-live="polite">
          <p className={s.figureBody}>This sounds like:</p>
          <ul className={s.suggestions} role="list">
            {suggestions.map((type) => (
              <li key={type}>
                <button type="button" className={s.suggestion} disabled={busy !== null} onClick={() => start(type, { type })}>
                  {busy === type ? "Starting…" : PROJECT_TYPE_INFO[type].label}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {failed ? (
        <p className={s.error} role="alert">
          {failedText}
        </p>
      ) : null}
    </div>
  );
}

/** "In your own words" and the "Something else?" band: a Something else project that starts from the customer's sentence. */
export function DescribeIt({ variant }: { variant: "card" | "band" }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { busy, failed, start } = useStart();
  const id = `describe-${variant}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setError("Tell us in a sentence what you need.");
      return;
    }
    setError(null);
    void start(variant, { type: "SOMETHING_ELSE", description: text.trim() });
  };
  const message = error ?? (failed ? failedText : null);
  if (variant === "band") {
    return (
      <form onSubmit={submit} noValidate>
        <div className={s.field}>
          <Sparkles size={20} aria-hidden="true" />
          <label htmlFor={id} className="hp-visually-hidden">
            What do you need?
          </label>
          <input id={id} value={text} onChange={(event) => setText(event.target.value)} placeholder="I need…" maxLength={2000} aria-invalid={Boolean(error)} aria-describedby={message ? `${id}-error` : undefined} />
          <button type="submit" className={s.inkButton} disabled={busy !== null}>
            {busy ? "Starting…" : "Talk to us"}
          </button>
        </div>
        {message ? (
          <p id={`${id}-error`} className={s.error} role="alert">
            {message}
          </p>
        ) : null}
      </form>
    );
  }
  return (
    <form className={s.describe} onSubmit={submit} noValidate>
      <p className={s.mono}>OR DESCRIBE IT</p>
      <h2 className={s.describeTitle}>
        <label htmlFor={id}>In your own words</label>
      </h2>
      <textarea
        id={id}
        className={s.textarea}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="e.g. “Branded kit for 250 guests at our Lagos conference in six weeks — badges, a backdrop and crew shirts.”"
        maxLength={2000}
        aria-invalid={Boolean(error)}
        aria-describedby={message ? `${id}-error` : undefined}
      />
      {message ? (
        <p id={`${id}-error`} className={s.error} role="alert">
          {message}
        </p>
      ) : null}
      <div className={s.describeRow}>
        <p className={s.note}>We start a draft project from it</p>
        <button type="submit" className={s.outlineButton} disabled={busy !== null}>
          {busy ? "Starting…" : "Continue"}
        </button>
      </div>
    </form>
  );
}

/** A whole card that starts a project of its type (Stage 3.1D §3: the entire card is clickable). */
export function TypeCard({ type, className, children }: { type: ProjectType; className: string | undefined; children: ReactNode }) {
  const { busy, failed, start } = useStart();
  return (
    <>
      <button type="button" className={className} onClick={() => start(type, { type })} disabled={busy !== null} aria-label={`Start a project: ${PROJECT_TYPE_INFO[type].label}`}>
        {children}
      </button>
      {failed ? (
        <p className={s.error} role="alert">
          {failedText}
        </p>
      ) : null}
    </>
  );
}
