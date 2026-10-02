"use client";

import {
  ApiError,
  type AnswerValue,
  BRAND_READINESS,
  COMMON_QUESTIONS,
  DEADLINE_LABEL,
  NOT_SURE,
  OPEN_ITEM_LABEL,
  type Project,
  type ProjectAnswers,
  PROJECT_QUESTIONS,
  PROJECT_STEPS,
  PROJECT_TYPE_INFO,
  type ProjectQuestion,
  projectSchema,
  type ProjectStep,
} from "@holypearls/contracts";
import { Button, FormField, Notice, TextField } from "@holypearls/ui";
import { ArrowLeft, ArrowRight, CloudCheck, Headset } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { FileUpload } from "../FileUpload";
import { NeedHelp } from "../NeedHelp";
import { QuestionField } from "./Questions";
import { fromPrice, type RecommendationActions, Recommendations } from "./Recommendations";
import s from "./builder.module.css";

/*
 * The project builder (T05-01; PROJ-FR-001–008, Stage 3.1D; Pen 24 · LqHMw).
 * Six steps that never change. Answers save as you go (debounced) and every
 * save sends the version it started from; a save from another tab returns
 * the latest project instead of being overwritten (TECH-02 §5).
 */

type SaveState = "idle" | "saving" | "saved" | "failed";
type Patch = { answers?: ProjectAnswers; title?: string | null; step?: ProjectStep };

const stepIndex = (step: ProjectStep) => PROJECT_STEPS.findIndex((item) => item.key === step);
const COMMON = new Map(COMMON_QUESTIONS.map((question) => [question.key, question]));
const DATE_QUESTIONS = ["neededBy", "setupDate", "country", "city", "locationNote"].map((key) => COMMON.get(key)!);
const BRAND_QUESTIONS = ["brand", "brandNote"].map((key) => COMMON.get(key)!);

function questionsOf(project: Project, step: ProjectStep): ProjectQuestion[] {
  if (step === "PROJECT") return PROJECT_QUESTIONS[project.type].project;
  if (step === "SCALE") return PROJECT_QUESTIONS[project.type].scale;
  if (step === "DATE_LOCATION") return DATE_QUESTIONS;
  if (step === "BRAND") return BRAND_QUESTIONS;
  return [];
}

const HEADINGS: Record<ProjectStep, { title: string; lead: string }> = {
  PROJECT: { title: "Tell us about the project", lead: "Only what changes what we suggest. Skip anything you don't know yet." },
  SCALE: { title: "How big is it?", lead: "Rough numbers are fine. \"I'm not sure yet\" is fine too." },
  DATE_LOCATION: { title: "When and where?", lead: "No street address yet. We only need the city for now." },
  BRAND: { title: "What do you have already?", lead: "You don't need artwork to get suggestions. Send files now or later." },
  RECOMMENDATIONS: { title: "What we suggest", lead: "" },
  REVIEW: { title: "Check your project", lead: "Everything you've told us, in one place. Edit any part." },
};

/** "250 guests", "Lagos", "6 weeks away": the brief at a glance (Pen 24). */
function briefChips(project: Project): string[] {
  const chips: string[] = [];
  for (const question of PROJECT_QUESTIONS[project.type].scale) {
    const value = project.answers[question.key];
    if (question.kind === "NUMBER" && typeof value === "number") chips.push(`${value.toLocaleString("en-NG")} ${question.unit}`);
  }
  if (typeof project.answers.city === "string") chips.push(project.answers.city);
  const neededBy = project.answers.neededBy;
  if (typeof neededBy === "string" && neededBy !== NOT_SURE) {
    const weeks = Math.round((Date.parse(neededBy) - Date.now()) / (7 * 86_400_000));
    chips.push(weeks >= 2 ? `${weeks} weeks away` : `Needed ${new Date(neededBy).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`);
  }
  const brand = Array.isArray(project.answers.brand) ? project.answers.brand : [];
  if (brand.length) chips.push(BRAND_READINESS.filter((item) => brand.includes(item.value)).map((item) => item.label).join(" + "));
  return chips;
}

function lines(project: Project) {
  return [
    ...project.recommendations
      .filter((rec) => rec.state === "INCLUDED")
      .map((rec) => ({ key: rec.key, name: rec.name, quantity: rec.customerQuantity ?? rec.suggestedQuantity, end: rec.product ? (fromPrice(rec.product.price) ?? "Quoted") : "Quoted after review" })),
    ...project.items.map((item) => ({ key: item.id, name: item.name, quantity: item.quantity, end: item.kind === "CUSTOM" ? "Custom item" : (fromPrice(item.product?.price) ?? "Quoted") })),
  ];
}

function answerText(question: ProjectQuestion, value: AnswerValue | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === NOT_SURE) return "Not sure yet";
  if (question.kind === "YES_NO") return value === "YES" ? "Yes" : "No";
  if ((question.kind === "CHOICE" || question.kind === "MULTI") && (typeof value === "string" || Array.isArray(value))) {
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => question.options.find((option) => option.value === item)?.label ?? item).join(", ");
  }
  if (question.kind === "DATE" && typeof value === "string") return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  return typeof value === "number" ? value.toLocaleString("en-NG") : String(value);
}

/** Emails a link to come back on any device (PROJ-FR-007). A guest who saves it can also upload files. */
function SaveLink({ project, onSaved }: { project: Project; onSaved: (project: Project) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await api(`/v1/projects/${project.id}/email`, { method: "POST", body: { email }, response: projectSchema }));
      setSent(true);
    } catch (problem) {
      setError(problem instanceof ApiError && problem.body.fieldErrors?.email ? problem.body.fieldErrors.email : "We couldn't send the link. Check the email and try again.");
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <Notice tone="success" title="Link sent" live>
        <p>Open it on any device to carry on where you left off.</p>
      </Notice>
    );
  }
  return (
    <form className={s.questions} onSubmit={submit} noValidate>
      <FormField id="save-email" label="Email me a link to this project" hint="Come back on any device. No account needed." error={error ?? undefined}>
        <TextField type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </FormField>
      <Button type="submit" variant="secondary" loading={busy}>
        Send link
      </Button>
    </form>
  );
}

export function Builder({ initial, step, signedIn }: { initial: Project; step: ProjectStep; signedIn: boolean }) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const version = useRef(initial.version);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef<Patch>({});
  const failed = useRef<Patch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = stepIndex(step);
  const meta = PROJECT_STEPS[index]!;

  /** Runs one change after the previous one, always with the newest version. */
  const run = useCallback((change: (version: number) => Promise<Project>, retry?: Patch): Promise<boolean> => {
    const job = queue.current.then(async () => {
      setSaveState("saving");
      try {
        const next = await change(version.current);
        version.current = next.version;
        setProject(next);
        setSaveState("saved");
        failed.current = null;
        return true;
      } catch (problem) {
        if (problem instanceof ApiError && problem.code === "VERSION_CONFLICT") {
          const latest = projectSchema.safeParse(problem.body.context?.latest);
          if (latest.success) {
            version.current = latest.data.version;
            setProject(latest.data);
            setConflict(true);
            setSaveState("saved");
            return false;
          }
        }
        if (problem instanceof ApiError && problem.body.fieldErrors) {
          setErrors(Object.fromEntries(Object.entries(problem.body.fieldErrors).map(([key, message]) => [key.replace(/^answers\./, ""), message])));
          setSaveState("failed");
          return false;
        }
        if (retry) failed.current = { ...retry, answers: { ...retry.answers, ...failed.current?.answers } };
        setSaveState("failed");
        return false;
      }
    });
    queue.current = job;
    return job;
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    if (!patch.answers && patch.title === undefined) return queue.current;
    return run((current) => api(`/v1/projects/${project.id}`, { method: "PATCH", body: { version: current, ...patch }, response: projectSchema }), patch);
  }, [project.id, run]);

  useEffect(() => () => void flush(), [flush]);

  const schedule = (patch: Patch) => {
    pending.current = { ...pending.current, ...patch, answers: { ...pending.current.answers, ...patch.answers } };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  };

  const setAnswer = (key: string, value: AnswerValue) => {
    setErrors((current) => {
      const { [key]: _gone, ...rest } = current;
      void _gone;
      return rest;
    });
    setProject((current) => ({ ...current, answers: { ...current.answers, [key]: value } }));
    schedule({ answers: { [key]: value } });
  };

  const retry = () => {
    const patch = failed.current;
    failed.current = null;
    if (patch) schedule(patch);
    void flush();
  };

  const goTo = async (target: ProjectStep) => {
    setMoving(true);
    await flush();
    await run((current) => api(`/v1/projects/${project.id}`, { method: "PATCH", body: { version: current, step: target }, response: projectSchema }));
    router.push(`/start/${project.id}/${PROJECT_STEPS[stepIndex(target)]!.slug}`);
  };

  const call = (path: string, init: { method: "PATCH" | "POST" | "DELETE"; body?: Record<string, unknown> }) =>
    run((current) =>
      api(init.method === "DELETE" ? `${path}?version=${current}` : path, { method: init.method, body: init.body ? { version: current, ...init.body } : undefined, response: projectSchema }),
    );

  const actions: RecommendationActions = {
    setState: (key, state) => void call(`/v1/projects/${project.id}/recommendations/${key}`, { method: "PATCH", body: { state } }),
    setQuantity: (key, quantity) => void call(`/v1/projects/${project.id}/recommendations/${key}`, { method: "PATCH", body: { quantity } }),
    addItem: (input) => call(`/v1/projects/${project.id}/items`, { method: "POST", body: input }),
    updateItem: (id, input) => void call(`/v1/projects/${project.id}/items/${id}`, { method: "PATCH", body: input }),
    removeItem: (id) => void call(`/v1/projects/${project.id}/items/${id}`, { method: "DELETE" }),
    attachFile: (fileId, itemId) => void run(() => api(`/v1/projects/${project.id}/files`, { method: "POST", body: { fileId, itemId }, response: projectSchema })),
  };

  const removeFile = (fileId: string) => void run(() => api(`/v1/projects/${project.id}/files/${fileId}`, { method: "DELETE", response: projectSchema }));
  const attachBrandFile = (fileId: string) => void run(() => api(`/v1/projects/${project.id}/files`, { method: "POST", body: { fileId }, response: projectSchema }));

  const name = project.title || `${PROJECT_TYPE_INFO[project.type].label} project`;
  const projectLines = lines(project);
  const heading = HEADINGS[step];
  const canUpload = signedIn || project.linkEmailed;
  const nextStep = PROJECT_STEPS[index + 1];
  const prevStep = PROJECT_STEPS[index - 1];

  return (
    <div className={s.page}>
      <div className={s.bar}>
        <div>
          <span className={s.projectName}>{name}</span>
          <span className={s.projectId}>{project.reference ? `${project.reference} · ${project.status}` : "DRAFT · SAVED AS YOU GO"}</span>
        </div>
        <nav className={s.progressNav} aria-label="Project steps">
          <ol className={s.progress}>
            {PROJECT_STEPS.map((item, position) => {
              const label = (
                <>
                  <span>
                    {position + 1} {item.label}
                  </span>
                </>
              );
              const state = position < index ? "done" : position === index ? "current" : "upcoming";
              return (
                <li key={item.key}>
                  {position === index ? (
                    <span className={s.progressStep} aria-current="step" data-state={state}>
                      {label}
                    </span>
                  ) : (
                    <a
                      className={s.progressStep}
                      data-state={state}
                      href={`/start/${project.id}/${item.slug}`}
                      onClick={(event) => {
                        event.preventDefault();
                        void goTo(item.key);
                      }}
                    >
                      {label}
                      <span className="hp-visually-hidden">{state === "done" ? " (done)" : ""}</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <p className={s.saved} data-state={saveState} role="status" aria-live="polite">
          {saveState === "saving" ? (
            "Saving…"
          ) : saveState === "failed" ? (
            <>
              Not saved.{" "}
              <button type="button" className={s.retry} onClick={retry}>
                Try again
              </button>
            </>
          ) : saveState === "saved" ? (
            <>
              <CloudCheck size={16} aria-hidden="true" />
              Saved just now
            </>
          ) : null}
        </p>
      </div>

      <div className={s.body}>
        <div className={s.main}>
          <div className={s.head}>
            <p className={s.eyebrow}>
              STEP {index + 1} OF 6 · {meta.label.toUpperCase()}
            </p>
            <h1 className={s.h1}>{step === "RECOMMENDATIONS" ? `What we suggest for your ${PROJECT_TYPE_INFO[project.type].label.toLowerCase()} project` : heading.title}</h1>
            {heading.lead ? <p className={s.lead}>{heading.lead}</p> : null}
            {step === "RECOMMENDATIONS" ? (
              <ul className={s.brief} aria-label="Your brief">
                {briefChips(project).map((chip) => (
                  <li key={chip} className={s.briefChip}>
                    {chip}
                  </li>
                ))}
                <li>
                  <a className={s.textLink} href={`/start/${project.id}/scale`} onClick={(event) => (event.preventDefault(), void goTo("SCALE"))}>
                    Edit brief
                  </a>
                </li>
              </ul>
            ) : null}
            <button type="button" className={`${s.back} ${s.mobileSummary}`} aria-expanded={railOpen} aria-controls="project-summary" onClick={() => setRailOpen(!railOpen)}>
              {railOpen ? "Hide" : "Show"} your project ({projectLines.length} {projectLines.length === 1 ? "item" : "items"})
            </button>
          </div>

          {conflict ? (
            <Notice tone="info" title="This project changed in another tab" live>
              <p>We&apos;ve loaded the latest version. Check your answers, then carry on.</p>
            </Notice>
          ) : null}

          {step === "PROJECT" ? (
            <div className={s.questions}>
              <FormField id="project-title" label="Project name" hint="For example the event's name. Only you and HolyPearls see it." optional>
                <TextField
                  value={project.title ?? ""}
                  maxLength={120}
                  onChange={(event) => {
                    setProject((current) => ({ ...current, title: event.target.value }));
                    schedule({ title: event.target.value || null });
                  }}
                />
              </FormField>
              {questionsOf(project, step).map((question) => (
                <QuestionField key={question.key} question={question} value={project.answers[question.key]} error={errors[question.key]} onChange={(value) => setAnswer(question.key, value)} />
              ))}
            </div>
          ) : null}

          {step === "SCALE" || step === "DATE_LOCATION" ? (
            <div className={s.questions}>
              {questionsOf(project, step).map((question) => (
                <QuestionField key={question.key} question={question} value={project.answers[question.key]} error={errors[question.key]} onChange={(value) => setAnswer(question.key, value)} />
              ))}
              {step === "DATE_LOCATION" && project.deadline ? (
                <p className={s.deadline} data-state={project.deadline} role="status">
                  Timing: {DEADLINE_LABEL[project.deadline]}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "BRAND" ? (
            <div className={s.questions}>
              <QuestionField question={BRAND_QUESTIONS[0]!} value={project.answers.brand} error={errors.brand} onChange={(value) => setAnswer("brand", value)} />
              <section className={s.question} aria-labelledby="brand-files">
                <h2 id="brand-files" className={s.questionLabel}>
                  Logo, artwork or references
                </h2>
                {project.files.filter((file) => !file.itemId).length ? (
                  <ul className={s.files}>
                    {project.files
                      .filter((file) => !file.itemId)
                      .map((file) => (
                        <li key={file.fileId} className={s.fileRow}>
                          <span>
                            {file.name} · {file.status}
                          </span>
                          <button type="button" className={s.removeButton} onClick={() => removeFile(file.fileId)}>
                            Remove<span className="hp-visually-hidden"> {file.name}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : null}
                {canUpload ? (
                  <FileUpload purpose="PROJECT_ATTACHMENT" label="Add a file" hint="PDF, AI, SVG, PNG or JPEG" onChange={(file) => (file ? attachBrandFile(file.id) : undefined)} />
                ) : (
                  <>
                    <p className={s.hint}>To upload files, save this project with your email first. It also lets you come back on any device.</p>
                    <SaveLink project={project} onSaved={(next) => ((version.current = next.version), setProject(next))} />
                  </>
                )}
              </section>
              <QuestionField question={BRAND_QUESTIONS[1]!} value={project.answers.brandNote} error={errors.brandNote} onChange={(value) => setAnswer("brandNote", value)} />
            </div>
          ) : null}

          {step === "RECOMMENDATIONS" ? <Recommendations project={project} actions={actions} /> : null}

          {step === "REVIEW" ? (
            <>
              {(["PROJECT", "SCALE", "DATE_LOCATION", "BRAND"] as const).map((section) => {
                const answered = questionsOf(project, section)
                  .map((question) => ({ question, text: answerText(question, project.answers[question.key]) }))
                  .filter((row) => row.text);
                const files = section === "BRAND" ? project.files.filter((file) => !file.itemId) : [];
                return (
                  <section key={section} className={s.reviewSection} aria-labelledby={`review-${section}`}>
                    <div className={s.reviewHead}>
                      <h2 id={`review-${section}`} className={s.reviewTitle}>
                        {PROJECT_STEPS[stepIndex(section)]!.label}
                      </h2>
                      <a className={s.textLink} href={`/start/${project.id}/${PROJECT_STEPS[stepIndex(section)]!.slug}`} onClick={(event) => (event.preventDefault(), void goTo(section))}>
                        Edit<span className="hp-visually-hidden"> {PROJECT_STEPS[stepIndex(section)]!.label}</span>
                      </a>
                    </div>
                    {answered.length || files.length || (section === "PROJECT" && project.title) ? (
                      <dl className={s.facts}>
                        {section === "PROJECT" ? (
                          <>
                            <dt>Kind of project</dt>
                            <dd>{PROJECT_TYPE_INFO[project.type].label}</dd>
                            {project.title ? (
                              <>
                                <dt>Name</dt>
                                <dd>{project.title}</dd>
                              </>
                            ) : null}
                          </>
                        ) : null}
                        {answered.map(({ question, text }) => (
                          <div key={question.key} className={s.factRow}>
                            <dt>{question.label}</dt>
                            <dd>{text}</dd>
                          </div>
                        ))}
                        {files.length ? (
                          <>
                            <dt>Files</dt>
                            <dd>{files.map((file) => file.name).join(", ")}</dd>
                          </>
                        ) : null}
                      </dl>
                    ) : (
                      <p className={s.hint}>Nothing yet. That&apos;s fine: we&apos;ll ask when we review it.</p>
                    )}
                  </section>
                );
              })}
              <section className={s.reviewSection} aria-labelledby="review-items">
                <div className={s.reviewHead}>
                  <h2 id="review-items" className={s.reviewTitle}>
                    Items ({projectLines.length})
                  </h2>
                  <a className={s.textLink} href={`/start/${project.id}/recommendations`} onClick={(event) => (event.preventDefault(), void goTo("RECOMMENDATIONS"))}>
                    Edit items
                  </a>
                </div>
                {projectLines.length ? (
                  <dl className={s.facts}>
                    {projectLines.map((line) => (
                      <div key={line.key} className={s.factRow}>
                        <dt>{line.name}</dt>
                        <dd>
                          {line.quantity === null ? "Quantity after review" : `× ${line.quantity.toLocaleString("en-NG")}`} · {line.end}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className={s.hint}>No items yet. Add some from Recommendations, or describe them in a custom item.</p>
                )}
              </section>
              <Notice tone="info" title="Next: request your quote">
                <p>Sending your project for a quote opens here shortly. Save a link so you can come back to it.</p>
              </Notice>
              {!project.linkEmailed ? <SaveLink project={project} onSaved={(next) => ((version.current = next.version), setProject(next))} /> : null}
            </>
          ) : null}

          <div className={s.nav}>
            {prevStep ? (
              <button type="button" className={s.back} onClick={() => void goTo(prevStep.key)} disabled={moving}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </button>
            ) : (
              <a className={s.back} href="/start">
                <ArrowLeft size={16} aria-hidden="true" />
                All projects
              </a>
            )}
            {nextStep ? (
              <button type="button" className={s.next} onClick={() => void goTo(nextStep.key)} disabled={moving}>
                {moving ? "Saving…" : nextStep.key === "REVIEW" ? "Review project" : "Continue"}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <aside id="project-summary" className={s.rail} data-mobile={railOpen ? "shown" : "hidden"} aria-label="Your project so far">
          <p className={s.railLabel}>YOUR PROJECT SO FAR</p>
          <p className={s.railCount}>
            {projectLines.length} {projectLines.length === 1 ? "item" : "items"}
          </p>
          {projectLines.length ? (
            <ul className={s.railLines}>
              {projectLines.map((line) => (
                <li key={line.key} className={s.railLine}>
                  <span>
                    <span className={s.railTitle}>{line.name}</span>
                    <span className={s.railQty}>{line.quantity === null ? "Quantity after review" : `× ${line.quantity.toLocaleString("en-NG")}`}</span>
                  </span>
                  <span className={s.railEnd}>{line.end}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {project.openItems.length ? (
            <ul className={s.openItems} aria-label="Still to come">
              {project.openItems.map((item) => (
                <li key={item}>{OPEN_ITEM_LABEL[item]}</li>
              ))}
            </ul>
          ) : null}
          <div className={s.railTotal}>
            <p className={s.railTotalTitle}>Price · QUOTE REQUIRED</p>
            <p className={s.railNote}>We&apos;ll check your brief, confirm the details and send you a full quote. You only pay after you accept it.</p>
          </div>
          {nextStep && step !== "REVIEW" ? (
            <button type="button" className={s.next} onClick={() => void goTo(index < stepIndex("RECOMMENDATIONS") ? "RECOMMENDATIONS" : "REVIEW")} disabled={moving}>
              {index < stepIndex("RECOMMENDATIONS") ? "See recommendations" : "Review project"}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : null}
          <div className={s.help}>
            <NeedHelp
              signedIn={signedIn}
              label="Need help planning this?"
              variant="tertiary"
              context={{
                page: { path: `/start/${project.id}/${meta.slug}`, title: `Start a Project · ${meta.label}` },
                step: meta.label,
                project: { id: project.id, label: name },
                files: project.files.slice(0, 20).map((file) => ({ id: file.fileId, label: file.name, status: file.status })),
              }}
            />
            <p className={s.railNote}>
              <Headset size={16} aria-hidden="true" /> We&apos;ll see this project and your files, so you won&apos;t repeat yourself.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

