"use client";

import { ApiError, type CollectionInvite, collectionInviteSchema, PERSONALIZATION_MAX, type ParticipantAnswers, type Participation, participationSchema } from "@holypearls/contracts";
import { Button, FormField, Notice, PageLoading, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason } from "@holypearls/web-kit/api";
import { type ReactNode, useEffect, useState } from "react";
import { z } from "zod";
import s from "./participant.module.css";

/*
 * The participant flow (Pen 31 · POSSY; 76 · AhA0c): no navigation, no
 * account, nobody else's answers, one decision per screen, the organization
 * on top and HolyPearls quietly underneath. No payment: the organization
 * pays (owner decision 2026-10-10).
 */

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

function Frame({ organization, title, children }: { organization: string; title: string; children: ReactNode }) {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <span className={s.mark} aria-hidden="true">
          {initials(organization)}
        </span>
        <span className={s.headerText}>
          <span className={s.organization}>{organization}</span>
          <span className={s.collection}>{title}</span>
        </span>
      </header>
      <main id="main-content" className={s.main}>
        {children}
      </main>
      <footer className={s.footer}>Made by HolyPearls for {organization.replace(/\s*\(.*?\)/g, "")}</footer>
    </div>
  );
}

const whatWeAsk = (invite: CollectionInvite) => {
  const parts = [...(invite.fields.includes("SIZE") ? ["your size"] : []), ...(invite.fields.includes("PERSONALIZATION") ? ["the name you'd like on it"] : []), ...(invite.fields.includes("COLOUR") ? ["the colour"] : []), ...(invite.fields.includes("QUANTITY") ? ["how many"] : []), ...(invite.deliveryMode === "BRANCHES" ? ["your branch"] : [])];
  if (!parts.length) return "Tell us you're in.";
  return `Tell us ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}.`;
};

/** Closed or paused links explain what happened and who to ask (Pen 76 E). */
function Unavailable({ invite }: { invite: CollectionInvite }) {
  return (
    <section className={s.card} aria-labelledby="unavailable-title">
      <h1 id="unavailable-title" className={s.title}>
        {invite.status === "PAUSED" ? "This collection is paused" : "This collection has closed"}
      </h1>
      <p className={s.body}>
        {invite.status === "PAUSED"
          ? `${invite.organizationName} paused it for now. Try the link again later.`
          : `${invite.organizationName} closed it${invite.deadline ? ` on ${day(invite.deadline)}` : ""}. If you still need one, ask your organiser. They can add you to a later order.`}
      </p>
    </section>
  );
}

/** The share link (`/g#secret`): what this is, then your name and email to start (B2B-FR-060). */
export function JoinCollection() {
  const [secret, setSecret] = useState<string | null>(null);
  const [invite, setInvite] = useState<CollectionInvite | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    const value = window.location.hash.slice(1);
    // The secret leaves the address bar straight away (TECH-03 §5).
    window.history.replaceState(null, "", "/g");
    if (!value) {
      setState("invalid");
      return;
    }
    setSecret(value);
    api("/v1/collections/invite", { method: "POST", body: { secret: value }, response: collectionInviteSchema })
      .then((result) => {
        setInvite(result);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, []);

  const start = async () => {
    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) problems.email = "Enter your email address";
    setErrors(problems);
    if (Object.keys(problems).length || !secret) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const joined = await api("/v1/collections/join", { method: "POST", body: { secret, name: name.trim(), email: email.trim() }, response: z.object({ participantId: z.string(), redirectTo: z.string() }) });
      window.location.replace(joined.redirectTo);
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setFailure(errorReason(error) === "COLLECTION_PAUSED" ? "This collection is paused. Try again later." : errorReason(error) === "COLLECTION_CLOSED" ? "This collection has closed." : "We couldn't start. Try again.");
    }
  };

  if (state === "loading") return <PageLoading label="Opening the collection" />;
  if (state === "invalid" || !invite) {
    return (
      <div className={s.page}>
        <main id="main-content" className={s.main}>
          <section className={s.card} aria-labelledby="invalid-title">
            <h1 id="invalid-title" className={s.title}>
              This link doesn&apos;t work
            </h1>
            <p className={s.body}>It may have been copied only in part, or the collection was cancelled. Ask your organiser for the link again.</p>
          </section>
        </main>
      </div>
    );
  }
  return (
    <Frame organization={invite.organizationName} title={invite.title}>
      {invite.status !== "OPEN" ? (
        <Unavailable invite={invite} />
      ) : (
        <section className={s.card} aria-labelledby="join-title">
          <p className={s.eyebrow}>From {invite.organizationName.replace(/\s*\(.*?\)/g, "")}</p>
          <h1 id="join-title" className={s.title}>
            {invite.title}
          </h1>
          <p className={s.body}>
            {invite.productName}. {whatWeAsk(invite)}
          </p>
          <ul className={s.facts}>
            {invite.deadline ? <li>Closes {day(invite.deadline)}</li> : null}
            <li>Only you and your organiser see your answers</li>
            <li>Nothing to pay</li>
          </ul>
          {failure ? (
            <Notice tone="error" live>
              <p>{failure}</p>
            </Notice>
          ) : null}
          <FormField id="participant-name" label="Your name" error={errors.name}>
            <TextField autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField id="participant-email" label="Your email" hint="We send you a copy and a link to change your answers." error={errors.email}>
            <TextField type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FormField>
          <Button fullWidth loading={busy} onClick={() => void start()}>
            Start
          </Button>
        </section>
      )}
    </Frame>
  );
}

type Step = "size" | "name" | "colour" | "quantity" | "branch" | "check";

/** One decision per screen (Pen 31): size, name, colour, quantity, branch, then check and send. */
export function ParticipantFlow({ initial }: { initial: Participation }) {
  const [participation, setParticipation] = useState(initial);
  const [answers, setAnswers] = useState<ParticipantAnswers>(initial.answers);
  const { collection } = participation;
  const steps: Step[] = [
    ...(collection.fields.includes("SIZE") ? (["size"] as const) : []),
    ...(collection.fields.includes("PERSONALIZATION") ? (["name"] as const) : []),
    ...(collection.fields.includes("COLOUR") ? (["colour"] as const) : []),
    ...(collection.fields.includes("QUANTITY") ? (["quantity"] as const) : []),
    ...(collection.deliveryMode === "BRANCHES" ? (["branch"] as const) : []),
    "check",
  ];
  const [step, setStep] = useState<Step | "done">(initial.status === "SUBMITTED" ? "done" : steps[0]!);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const index = step === "done" ? steps.length : steps.indexOf(step);
  const firstName = participation.name.split(/\s+/)[0];

  const failed = (problem: unknown) => {
    if (problem instanceof ApiError && problem.body.fieldErrors) setError(Object.values(problem.body.fieldErrors)[0]);
    else if (errorCode(problem) === "VERSION_CONFLICT") setError("Your answers changed in another window. Reload the page.");
    else setError(errorReason(problem) === "COLLECTION_PAUSED" ? "This collection is paused. Try again later." : errorReason(problem) === "COLLECTION_CLOSED" ? "This collection has closed." : "We couldn't save that. Try again.");
  };
  const next = async () => {
    setError(undefined);
    if (step === "size" && !answers.size && !answers.sizeUnsure) return setError("Choose your size.");
    if (step === "colour" && !answers.colour) return setError("Choose a colour.");
    if (step === "branch" && !answers.branchLocationId) return setError("Choose your branch.");
    setBusy(true);
    try {
      const saved = await api(`/v1/participants/${participation.participantId}/answers`, { method: "PUT", body: { answers, version: participation.version }, response: participationSchema });
      setParticipation(saved);
      setStep(steps[index + 1] ?? "check");
    } catch (problem) {
      failed(problem);
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const sent = await api(`/v1/participants/${participation.participantId}/submit`, { method: "POST", body: { version: participation.version }, response: participationSchema });
      setParticipation(sent);
      setStep("done");
    } catch (problem) {
      failed(problem);
    } finally {
      setBusy(false);
    }
  };
  const branchName = collection.branches.find((branch) => branch.id === answers.branchLocationId)?.name;

  if (!participation.canEdit && step !== "done") {
    return (
      <Frame organization={collection.organizationName} title={collection.title}>
        <Unavailable invite={collection} />
      </Frame>
    );
  }
  if (step === "done") {
    return (
      <Frame organization={collection.organizationName} title={collection.title}>
        <section className={s.card} aria-labelledby="done-title">
          <h1 id="done-title" className={s.title}>
            You&apos;re in, {firstName}
          </h1>
          <p className={s.body}>
            Your {collection.productName.toLowerCase()}
            {answers.size ? ` in size ${answers.size}` : ""}
            {answers.personalization ? ` with ${answers.personalization} on it` : ""} is part of {collection.organizationName.replace(/\s*\(.*?\)/g, "")}&apos;s team order
            {branchName ? ` for ${branchName}` : ""}.
          </p>
          <ul className={s.facts}>
            {participation.canEdit && collection.deadline ? <li>Change your answers until {day(collection.deadline)}</li> : null}
            <li>We&apos;ve emailed you a copy</li>
            <li>{collection.deliveryMode === "BRANCHES" ? "Delivered with your branch's team delivery" : "Delivered with the team order"}</li>
          </ul>
          {participation.canEdit ? (
            <Button variant="secondary" onClick={() => setStep(steps[0]!)}>
              Change my answers
            </Button>
          ) : null}
        </section>
      </Frame>
    );
  }
  return (
    <Frame organization={collection.organizationName} title={collection.title}>
      <section className={s.card} aria-labelledby="step-title">
        <p className={s.eyebrow}>
          Step {index + 1} of {steps.length}
        </p>
        {participation.correction ? (
          <Notice tone="warning" title="Please fix 1 thing">
            <p>{participation.correction}</p>
          </Notice>
        ) : null}
        {step === "size" ? (
          <>
            <h1 id="step-title" className={s.title}>
              What size are you?
            </h1>
            <div className={s.choices} role="radiogroup" aria-labelledby="step-title">
              {participation.sizes.map((size) => (
                <button key={size} type="button" role="radio" aria-checked={answers.size === size} className={s.choice} onClick={() => setAnswers({ ...answers, size, sizeUnsure: false })}>
                  {size}
                </button>
              ))}
            </div>
            {collection.unsureSizeRule === "ALLOW_UNSURE" ? (
              <button type="button" role="radio" aria-checked={answers.sizeUnsure} className={`${s.choice} ${s.wide}`} onClick={() => setAnswers({ ...answers, size: null, sizeUnsure: true })}>
                I&apos;m not sure
                <span className={s.choiceHint}>Your organiser will help confirm it</span>
              </button>
            ) : null}
            <p className={s.hint}>Not sure? Check a garment that fits you well, or ask your organiser.</p>
          </>
        ) : null}
        {step === "name" ? (
          <>
            <h1 id="step-title" className={s.title}>
              Name on your {collection.productName.toLowerCase()}?
            </h1>
            <p className={s.preview} aria-live="polite">
              {answers.personalization || "Just the logo"}
            </p>
            <FormField id="participant-personalization" label={`Name for embroidery (up to ${PERSONALIZATION_MAX})`} hint={`${(answers.personalization ?? "").length} of ${PERSONALIZATION_MAX} letters · spelling is exactly what gets stitched`}>
              <TextField maxLength={PERSONALIZATION_MAX} value={answers.personalization ?? ""} onChange={(event) => setAnswers({ ...answers, personalization: event.target.value.toUpperCase() || null })} />
            </FormField>
            <Button variant="tertiary" onClick={() => setAnswers({ ...answers, personalization: null })}>
              No name, just the logo
            </Button>
          </>
        ) : null}
        {step === "colour" ? (
          <>
            <h1 id="step-title" className={s.title}>
              Which colour?
            </h1>
            <div className={s.list} role="radiogroup" aria-labelledby="step-title">
              {participation.colours.map((colour) => (
                <button key={colour.value} type="button" role="radio" aria-checked={answers.colour === colour.value} className={`${s.choice} ${s.wide}`} onClick={() => setAnswers({ ...answers, colour: colour.value })}>
                  {colour.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {step === "quantity" ? (
          <>
            <h1 id="step-title" className={s.title}>
              How many?
            </h1>
            <FormField id="participant-quantity" label="Quantity">
              <TextField inputMode="numeric" pattern="[0-9]*" value={String(answers.quantity ?? 1)} onChange={(event) => setAnswers({ ...answers, quantity: Math.max(1, Math.min(50, Number(event.target.value.replace(/\D/g, "")) || 1)) })} />
            </FormField>
          </>
        ) : null}
        {step === "branch" ? (
          <>
            <h1 id="step-title" className={s.title}>
              Where do you work?
            </h1>
            <div className={s.list} role="radiogroup" aria-labelledby="step-title">
              {collection.branches.map((branch) => (
                <button key={branch.id} type="button" role="radio" aria-checked={answers.branchLocationId === branch.id} className={`${s.choice} ${s.wide}`} onClick={() => setAnswers({ ...answers, branchLocationId: branch.id })}>
                  {branch.name}
                </button>
              ))}
            </div>
            <p className={s.hint}>It arrives with your branch&apos;s team delivery. No home address needed.</p>
          </>
        ) : null}
        {step === "check" ? (
          <>
            <h1 id="step-title" className={s.title}>
              Check and send.
            </h1>
            <dl className={s.summary}>
              <div>
                <dt>{collection.productName}</dt>
                <dd />
              </div>
              {collection.fields.includes("SIZE") ? (
                <div>
                  <dt>Size</dt>
                  <dd>{answers.sizeUnsure ? "Not sure yet" : answers.size}</dd>
                  <button type="button" className={s.edit} onClick={() => setStep("size")}>
                    Edit<span className="hp-visually-hidden"> size</span>
                  </button>
                </div>
              ) : null}
              {collection.fields.includes("PERSONALIZATION") ? (
                <div>
                  <dt>Name</dt>
                  <dd>{answers.personalization || "Just the logo"}</dd>
                  <button type="button" className={s.edit} onClick={() => setStep("name")}>
                    Edit<span className="hp-visually-hidden"> name</span>
                  </button>
                </div>
              ) : null}
              {collection.fields.includes("COLOUR") ? (
                <div>
                  <dt>Colour</dt>
                  <dd>{participation.colours.find((colour) => colour.value === answers.colour)?.label}</dd>
                  <button type="button" className={s.edit} onClick={() => setStep("colour")}>
                    Edit<span className="hp-visually-hidden"> colour</span>
                  </button>
                </div>
              ) : null}
              {collection.fields.includes("QUANTITY") ? (
                <div>
                  <dt>Quantity</dt>
                  <dd>{answers.quantity ?? 1}</dd>
                  <button type="button" className={s.edit} onClick={() => setStep("quantity")}>
                    Edit<span className="hp-visually-hidden"> quantity</span>
                  </button>
                </div>
              ) : null}
              {collection.deliveryMode === "BRANCHES" ? (
                <div>
                  <dt>Branch</dt>
                  <dd>{branchName}</dd>
                  <button type="button" className={s.edit} onClick={() => setStep("branch")}>
                    Edit<span className="hp-visually-hidden"> branch</span>
                  </button>
                </div>
              ) : null}
            </dl>
            <p className={s.hint}>This joins {collection.organizationName.replace(/\s*\(.*?\)/g, "")}&apos;s team order. It isn&apos;t an order on its own, and there&apos;s nothing to pay.</p>
          </>
        ) : null}
        {error ? (
          <p className={s.error} role="alert">
            {error}
          </p>
        ) : null}
        {step === "check" ? (
          <Button fullWidth loading={busy} onClick={() => void send()}>
            Send my response
          </Button>
        ) : (
          <Button fullWidth loading={busy} onClick={() => void next()}>
            Continue
          </Button>
        )}
        {collection.deadline ? <p className={s.hint}>You can change this until {day(collection.deadline)}</p> : null}
      </section>
    </Frame>
  );
}
