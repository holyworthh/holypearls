"use client";

import { type AnswerConflict, ApiError, type Configuration, configurationSchema, type Configurator as ConfiguratorData, type PriceResult } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextField } from "@holypearls/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, errorCode, errorReason } from "../../lib/api";
import styles from "./configurator.module.css";

const updateResponse = z.object({ draft: configurationSchema, removed: z.array(z.object({ option: z.string(), value: z.string(), message: z.string() })) });

type Artwork = "UPLOAD" | "LOGO" | "REFERENCE" | "DESIGN_HELP" | "LATER";
type SaveState = "idle" | "saving" | "saved" | "failed";
interface Pending {
  choices?: Record<string, string | null>;
  quantity?: number | null;
  artwork?: Artwork | null;
  step?: "options" | "quantity" | "artwork" | "delivery" | "review";
}

const naira = (minor: string | null | undefined, currency: string | null) => {
  if (!minor) return "—";
  const value = BigInt(minor);
  const whole = value / 100n;
  const kobo = value % 100n;
  const symbol = currency === "USD" ? "$" : "₦";
  return `${symbol}${whole.toLocaleString("en-NG")}${kobo ? `.${kobo.toString().padStart(2, "0")}` : ""}`;
};

const ARTWORK: { value: Artwork; title: string; meta: string }[] = [
  { value: "UPLOAD", title: "Upload my design", meta: "PDF works best · we check it" },
  { value: "DESIGN_HELP", title: "Need design help", meta: "We'll contact you with options" },
  { value: "LATER", title: "I'll send it later", meta: "Held for artwork" },
];

const STATE_LABEL: Record<PriceResult["state"], { label: string; className: string }> = {
  PRICE_READY: { label: "PRICE READY · ORDER NOW", className: styles.stateReady! },
  ESTIMATE_READY: { label: "ESTIMATE · CONFIRMED AFTER REVIEW", className: styles.stateEstimate! },
  QUOTE_REQUIRED: { label: "QUOTE REQUIRED · CHOICES KEPT", className: styles.stateQuote! },
  CONSULTATION_REQUIRED: { label: "PLANNED WITH OUR TEAM", className: styles.stateQuote! },
};

interface Props {
  productSlug: string;
  productName: string;
  data: ConfiguratorData;
  initialDraft: Configuration | null;
}

/**
 * The inline configurator (Pen 21, COM-FR-010–014 and 040–044): Options →
 * Quantity → Artwork → Delivery → Review on one page. Every change autosaves
 * to a draft; the price sits next to the choices; combinations we can't make
 * are blocked before Review; a change that would remove later answers is
 * shown for confirmation first.
 */
export function Configurator({ productSlug, productName, data, initialDraft }: Props) {
  const defaults = Object.fromEntries(data.options.map((option) => [option.key, (option.values.find((value) => value.isDefault) ?? option.values[0])?.key ?? ""]));
  const [draft, setDraft] = useState<Configuration | null>(initialDraft);
  const [choices, setChoices] = useState<Record<string, string>>(initialDraft?.choices ?? defaults);
  const [quantity, setQuantity] = useState<number | null>(initialDraft?.quantity ?? null);
  const [custom, setCustom] = useState(initialDraft?.quantity && !data.quantityPresets.some((preset) => preset.quantity === initialDraft.quantity) ? String(initialDraft.quantity) : "");
  const [artwork, setArtwork] = useState<Artwork | null>(initialDraft?.artwork ?? null);
  const [saveState, setSaveState] = useState<SaveState>(initialDraft ? "saved" : "idle");
  const [conflicts, setConflicts] = useState<{ list: AnswerConflict[]; pending: Pending; previous: Record<string, string> } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [stickyVisible, setStickyVisible] = useState(false);
  const pending = useRef<Pending>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const totalBar = useRef<HTMLDivElement>(null);
  draftRef.current = draft;

  const price = draft?.price ?? null;

  /** One save at a time: a save waits for the one before it, so it always sends the latest version. */
  const chain = useRef<Promise<void>>(Promise.resolve());
  const flush = useCallback((confirmRemovals = false) => {
    chain.current = chain.current.then(() => save(confirmRemovals));
    return chain.current;
  }, []);

  /** Sends everything waiting, creating the draft on the first change. */
  const save = async (confirmRemovals = false): Promise<void> => {
    const change = pending.current;
    pending.current = {};
    if (!Object.keys(change).length) return;
    setSaveState("saving");
    try {
      const current = draftRef.current;
      if (!current) {
        const created = await api("/v1/configurations", {
          method: "POST",
          body: {
            productSlug,
            choices: Object.fromEntries(Object.entries({ ...defaults, ...change.choices }).filter((entry): entry is [string, string] => Boolean(entry[1]))),
            ...(change.quantity ? { quantity: change.quantity } : {}),
          },
          response: configurationSchema,
        });
        setDraft(created);
        draftRef.current = created;
        // Remember the draft in the address, so a reload or a shared link returns to it.
        window.history.replaceState(null, "", `?draft=${created.id}`);
        const rest: Pending = { ...(change.artwork !== undefined && { artwork: change.artwork }), ...(change.step && { step: change.step }) };
        if (Object.keys(rest).length) {
          pending.current = { ...rest, ...pending.current };
          await save();
          return;
        }
      } else {
        const result = await api(`/v1/configurations/${current.id}`, {
          method: "PATCH",
          body: { version: current.version, ...change, confirmRemovals },
          response: updateResponse,
        });
        setDraft(result.draft);
        draftRef.current = result.draft;
        setChoices(result.draft.choices);
        if (result.removed.length) setNotice(`Removed: ${result.removed.map((item) => item.message).join(" ")}`);
      }
      setSaveState("saved");
    } catch (error) {
      if (errorCode(error) === "VERSION_CONFLICT" && error instanceof ApiError) {
        const latest = configurationSchema.safeParse(error.body.context?.latest);
        if (latest.success) {
          setDraft(latest.data);
          draftRef.current = latest.data;
          setChoices(latest.data.choices);
          setQuantity(latest.data.quantity);
          setNotice("This design was changed in another tab. We've loaded the latest version; check your choices.");
        }
        setSaveState("saved");
      } else if (errorReason(error) === "ANSWERS_CONFLICT" && error instanceof ApiError) {
        setConflicts({ list: (error.body.context?.conflicts as AnswerConflict[]) ?? [], pending: change, previous: draftRef.current?.choices ?? {} });
        setSaveState("saved");
      } else if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
        setNotice(Object.values(error.body.fieldErrors ?? {})[0] ?? "That choice isn't available.");
        setChoices(draftRef.current?.choices ?? defaults);
        setSaveState("saved");
      } else {
        // Keep the work on screen and try again (COM-FR-013).
        pending.current = { ...change, ...pending.current, choices: { ...change.choices, ...pending.current.choices } };
        setSaveState("failed");
      }
    }
  };

  const queue = (change: Pending) => {
    pending.current = {
      ...pending.current,
      ...change,
      ...(change.choices || pending.current.choices ? { choices: { ...pending.current.choices, ...change.choices } } : {}),
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  };

  // Retry failed saves every 5 seconds while the page is open.
  useEffect(() => {
    if (saveState !== "failed") return;
    const retry = setTimeout(() => void flush(), 5_000);
    return () => clearTimeout(retry);
  }, [saveState, flush]);

  // The mobile sticky bar shows while the total bar is off screen (COM-FR-002).
  useEffect(() => {
    const element = totalBar.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry!.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Why a value can't be chosen with the current answers, if it can't. */
  const blockedReason = (option: string, value: string) => {
    for (const rule of data.blocked) {
      if (rule.thenOption === option && rule.thenValues.includes(value) && choices[rule.ifOption] === rule.ifValue) return rule.message;
    }
    return null;
  };

  const choose = (option: string, value: string) => {
    setNotice(null);
    setChoices({ ...choices, [option]: value });
    queue({ choices: { [option]: value }, step: "options" });
  };

  const chooseQuantity = (value: number | null) => {
    setQuantity(value);
    if (value) queue({ quantity: value, step: "quantity" });
  };

  const chooseArtwork = (value: Artwork) => {
    setArtwork(value);
    queue({ artwork: value, step: "artwork" });
  };

  const resolveConflicts = async (remove: boolean) => {
    if (!conflicts) return;
    if (remove) {
      pending.current = conflicts.pending;
      await flush(true);
    } else {
      setChoices(conflicts.previous);
    }
    setConflicts(null);
  };

  const sendEmail = async () => {
    setEmailError(undefined);
    if (!draftRef.current) await flush();
    const current = draftRef.current;
    if (!current) return;
    try {
      const updated = await api(`/v1/configurations/${current.id}/email`, { method: "POST", body: { email }, response: configurationSchema });
      setDraft(updated);
      setEmailOpen(false);
      setNotice(`We've emailed a link to ${updated.emailedTo}. It opens this design on any device.`);
    } catch (error) {
      setEmailError(error instanceof ApiError && error.body.fieldErrors?.email ? error.body.fieldErrors.email : "We couldn't send it. Check the address and try again.");
    }
  };

  const valueLabel = (option: string, value: string | undefined) => data.options.find((item) => item.key === option)?.values.find((item) => item.key === value)?.label ?? "Not chosen";
  const state = price ? STATE_LABEL[price.state] : null;
  const blockingReasons = price?.reasons.filter((reason) => reason.blocking) ?? [];
  const summary = [quantity ? `${quantity.toLocaleString("en-NG")}` : null, ...data.options.map((option) => valueLabel(option.key, choices[option.key]))].filter(Boolean).join(" · ");
  const steps = ["options", "quantity", "artwork", "delivery", "review"] as const;
  const number = (step: (typeof steps)[number]) => String(steps.indexOf(step) + 1).padStart(2, "0");

  return (
    <div className={styles.configurator}>
      {state ? (
        <span className={`${styles.stateChip} ${state.className}`}>{state.label}</span>
      ) : data.fromPerUnitMinor ? (
        <span className={`${styles.stateChip} ${styles.stateReady}`}>FROM {naira(data.fromPerUnitMinor, data.currency)} EACH</span>
      ) : null}

      <fieldset className={styles.step} id="step-options">
        <legend className={styles.stepTitle}>
          <span className={styles.stepNumber}>{number("options")}</span> Options
        </legend>
        {data.options.map((option) => (
          <fieldset key={option.key} className={styles.step}>
            <legend className={styles.stepExtra}>{option.label}</legend>
            <div className={styles.choices}>
              {option.values.map((value) => {
                const blocked = blockedReason(option.key, value.key);
                const id = `choice-${option.key}-${value.key}`;
                return (
                  <label key={value.key} className={styles.choice} htmlFor={id}>
                    <input
                      id={id}
                      type="radio"
                      name={`option-${option.key}`}
                      value={value.key}
                      checked={choices[option.key] === value.key}
                      disabled={Boolean(blocked)}
                      aria-describedby={blocked ? `${id}-blocked` : undefined}
                      onChange={() => choose(option.key, value.key)}
                    />
                    <span className={styles.choiceTitle}>{value.label}</span>
                    {blocked ? (
                      <span className={styles.choiceMeta} id={`${id}-blocked`}>
                        Not available with your choices
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            {option.values.some((value) => blockedReason(option.key, value.key)) ? (
              <p className={styles.blockedNote}>{option.values.map((value) => blockedReason(option.key, value.key)).find(Boolean)}</p>
            ) : null}
          </fieldset>
        ))}
      </fieldset>

      <fieldset className={styles.step} id="step-quantity">
        <legend className={styles.stepHead}>
          <span className={styles.stepTitle}>
            <span className={styles.stepNumber}>{number("quantity")}</span> Quantity
          </span>
        </legend>
        <p className={styles.stepExtra}>Minimum {data.moq.toLocaleString("en-NG")}. Prices include VAT.</p>
        <div className={styles.choices}>
          {data.quantityPresets.map((preset) => (
            <label key={preset.quantity} className={styles.choice} htmlFor={`quantity-${preset.quantity}`}>
              <input
                id={`quantity-${preset.quantity}`}
                type="radio"
                name="quantity"
                checked={quantity === preset.quantity && !custom}
                onChange={() => {
                  setCustom("");
                  chooseQuantity(preset.quantity);
                }}
              />
              <span className={styles.quantityNumber}>{preset.quantity.toLocaleString("en-NG")}</span>
              {preset.perUnitMinor ? <span className={styles.choiceMeta}>{naira(preset.perUnitMinor, data.currency)} each</span> : null}
            </label>
          ))}
        </div>
        <div className={styles.customQuantity}>
          <FormField label="Or enter a quantity" id="custom-quantity">
            <TextField
              inputMode="numeric"
              value={custom}
              onChange={(event) => {
                const text = event.target.value.replace(/\D/g, "").slice(0, 8);
                setCustom(text);
                chooseQuantity(text ? Number(text) : null);
              }}
            />
          </FormField>
        </div>
      </fieldset>

      <fieldset className={styles.step} id="step-artwork">
        <legend className={styles.stepTitle}>
          <span className={styles.stepNumber}>{number("artwork")}</span> Artwork
        </legend>
        <div className={styles.choices}>
          {ARTWORK.map((option) => (
            <label key={option.value} className={styles.choice} htmlFor={`artwork-${option.value}`}>
              <input id={`artwork-${option.value}`} type="radio" name="artwork" checked={artwork === option.value} onChange={() => chooseArtwork(option.value)} />
              <span className={styles.choiceTitle}>{option.title}</span>
              <span className={styles.choiceMeta}>{option.meta}</span>
            </label>
          ))}
        </div>
        {artwork === "UPLOAD" ? <p className={styles.placeholder}>You&apos;ll upload your file when you order. We check it and send a proof before printing.</p> : null}
      </fieldset>

      <section className={styles.step} id="step-delivery" aria-labelledby="delivery-title">
        <h2 id="delivery-title" className={styles.stepTitle}>
          <span className={styles.stepNumber}>{number("delivery")}</span> Delivery
        </h2>
        <p className={styles.placeholder}>
          You choose delivery or pickup at checkout, where the cost and date are confirmed for your address. We deliver across Nigeria and can arrange international
          shipping.
        </p>
      </section>

      <section className={styles.step} id="step-review" aria-labelledby="review-title">
        <h2 id="review-title" className={styles.stepTitle}>
          <span className={styles.stepNumber}>{number("review")}</span> Review
        </h2>
        <dl className={styles.review}>
          {data.options.map((option) => (
            <div key={option.key}>
              <dt>{option.label}</dt>
              <dd>
                {valueLabel(option.key, choices[option.key])} <a href="#step-options">Edit<span className="hp-visually-hidden"> {option.label.toLowerCase()}</span></a>
              </dd>
            </div>
          ))}
          <div>
            <dt>Quantity</dt>
            <dd>
              {quantity ? quantity.toLocaleString("en-NG") : "Not chosen"} <a href="#step-quantity">Edit<span className="hp-visually-hidden"> quantity</span></a>
            </dd>
          </div>
          <div>
            <dt>Artwork</dt>
            <dd>
              {ARTWORK.find((option) => option.value === artwork)?.title ?? "Not chosen"} <a href="#step-artwork">Edit<span className="hp-visually-hidden"> artwork</span></a>
            </dd>
          </div>
        </dl>
      </section>

      <div className={styles.totalBar} ref={totalBar} aria-live="polite">
        <div className={styles.totalRow}>
          <div>
            <p className={styles.summary}>{summary}</p>
            <p className={styles.perUnit}>{price?.perUnitMinor ? `${naira(price.perUnitMinor, price.currency)} each, including VAT` : "Choose a quantity to see the price"}</p>
          </div>
          <p className={styles.total}>{price?.totalMinor ? naira(price.totalMinor, price.currency) : "—"}</p>
        </div>
        {price?.reasons.length ? (
          <ul className={styles.reasons}>
            {price.reasons
              .filter((reason) => reason.code !== "SAMPLE_PRICE")
              .map((reason) => (
                <li key={reason.code + reason.message} className={reason.blocking ? styles.blocking : undefined}>
                  {reason.message}
                </li>
              ))}
          </ul>
        ) : null}
        {notice ? (
          <Notice tone="info" title="Heads up" live>
            <p>{notice}</p>
          </Notice>
        ) : null}
        <Button fullWidth disabled title="Online checkout opens soon">
          {price?.state === "PRICE_READY" && !blockingReasons.length ? "Continue to checkout" : "Request a quote"}
        </Button>
        <p className={styles.perUnit}>Online checkout opens soon. Save this design now and we&apos;ll email you a link to come back to it.</p>
        <div className={styles.saveState}>
          {saveState === "saving" ? <span>Saving…</span> : null}
          {saveState === "saved" ? <span>Saved</span> : null}
          {saveState === "failed" ? (
            <>
              <span className={styles.saveFailed} role="alert">
                Not saved — retrying
              </span>
              <button type="button" className={styles.linkButton} onClick={() => void flush()}>
                Retry now
              </button>
            </>
          ) : null}
          <button type="button" className={styles.linkButton} onClick={() => setEmailOpen(true)}>
            {draft?.emailedTo ? `Link sent to ${draft.emailedTo} · send again` : "Email me a link to this design"}
          </button>
        </div>
        {data.leadDays ? (
          <p className={styles.perUnit}>
            Typical production {data.leadDays.min}–{data.leadDays.max} working days after artwork and proof approval.
          </p>
        ) : null}
      </div>

      {stickyVisible ? (
        <div className={styles.sticky} aria-label={`${productName} price`}>
          <span className={styles.stickyPrice}>
            <strong>{price?.totalMinor ? naira(price.totalMinor, price.currency) : data.fromPerUnitMinor ? `From ${naira(data.fromPerUnitMinor, data.currency)}` : ""}</strong>
            {price?.perUnitMinor ? `${naira(price.perUnitMinor, price.currency)} each` : "Choose options"}
          </span>
          <a className={styles.linkButton} href="#step-review">
            Review
          </a>
        </div>
      ) : null}

      <Dialog
        open={conflicts !== null}
        onClose={() => void resolveConflicts(false)}
        title="This change affects later answers"
        footer={
          <>
            <Button variant="secondary" onClick={() => void resolveConflicts(false)}>
              Keep my earlier choice
            </Button>
            <Button onClick={() => void resolveConflicts(true)}>Remove and continue</Button>
          </>
        }
      >
        <p>These answers don&apos;t work with your new choice and would be removed:</p>
        <ul>
          {conflicts?.list.map((item) => (
            <li key={item.option}>
              <strong>{valueLabel(item.option, item.value)}</strong>: {item.message}
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Email me this design"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmailOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void sendEmail()}>Send link</Button>
          </>
        }
      >
        <FormField label="Email" id="draft-email" error={emailError} hint="The link opens this design on any device. Keep it private.">
          <TextField type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
      </Dialog>
    </div>
  );
}
