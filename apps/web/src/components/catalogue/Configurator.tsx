"use client";

import { type AnswerConflict, ApiError, type Configuration, type ConfigurationDetails, configurationSchema, type Configurator as ConfiguratorData, type PriceResult } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextField } from "@holypearls/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, errorCode, errorReason } from "../../lib/api";
import styles from "./configurator.module.css";
import p from "./pdp.module.css";
import { CircleCheck, Clock, PenTool, Truck, Upload } from "lucide-react";
import { DeliveryFields, FamilyFields, QuoteRequest } from "./FamilyDelivery";

const updateResponse = z.object({ draft: configurationSchema, removed: z.array(z.object({ option: z.string(), value: z.string(), message: z.string() })) });

type Artwork = "UPLOAD" | "LOGO" | "REFERENCE" | "DESIGN_HELP" | "LATER";
type SaveState = "idle" | "saving" | "saved" | "failed";
interface Pending {
  choices?: Record<string, string | null>;
  quantity?: number | null;
  artwork?: Artwork | null;
  step?: "options" | "quantity" | "artwork" | "delivery" | "review";
  details?: ConfigurationDetails;
  rush?: "STANDARD" | "RUSH" | "PRIORITY";
}

const naira = (minor: string | null | undefined, currency: string | null) => {
  if (!minor) return "—";
  const value = BigInt(minor);
  const whole = value / 100n;
  const kobo = value % 100n;
  const symbol = currency === "USD" ? "$" : "₦";
  return `${symbol}${whole.toLocaleString("en-NG")}${kobo ? `.${kobo.toString().padStart(2, "0")}` : ""}`;
};

const ARTWORK: { value: Artwork; title: string; meta: string; Icon: typeof Upload }[] = [
  { value: "UPLOAD", title: "Upload my design", meta: "PDF · we check it", Icon: Upload },
  { value: "DESIGN_HELP", title: "Need design help", meta: "We'll contact you with options", Icon: PenTool },
  { value: "LATER", title: "I'll send it later", meta: "Held for artwork", Icon: Clock },
];

/** Option labels carry an optional second line after " · " ("Smooth matte · 350gsm"), shown as Pen's card meta. */
const splitLabel = (label: string) => {
  const at = label.indexOf(" · ");
  return at > 0 ? { title: label.slice(0, at), meta: label.slice(at + 3) } : { title: label, meta: null };
};

const STATE_LABEL: Record<PriceResult["state"], { label: string; className: string }> = {
  PRICE_READY: { label: "PRICE READY · ORDER NOW", className: styles.stateReady! },
  ESTIMATE_READY: { label: "ESTIMATE · CONFIRMED AFTER REVIEW", className: styles.stateEstimate! },
  QUOTE_REQUIRED: { label: "QUOTE REQUIRED · CHOICES KEPT", className: styles.stateQuote! },
  CONSULTATION_REQUIRED: { label: "PLANNED WITH OUR TEAM", className: styles.stateQuote! },
};

interface Props {
  productSlug: string;
  productName: string;
  family: string;
  data: ConfiguratorData;
  /** The list price state, for the chip before anything is chosen (Pen 21 "PRICE READY · ORDER NOW"). */
  listState?: "PRICE_READY" | "ESTIMATE_READY" | null;
  initialDraft: Configuration | null;
}

/**
 * The inline configurator (Pen 21, COM-FR-010–014 and 040–044): Options →
 * Quantity → Artwork → Delivery → Review on one page. Every change autosaves
 * to a draft; the price sits next to the choices; combinations we can't make
 * are blocked before Review; a change that would remove later answers is
 * shown for confirmation first.
 */
export function Configurator({ productSlug, productName, family, data, initialDraft, listState = null }: Props) {
  const defaults = Object.fromEntries(data.options.map((option) => [option.key, (option.values.find((value) => value.isDefault) ?? option.values[0])?.key ?? ""]));
  const [draft, setDraft] = useState<Configuration | null>(initialDraft);
  const [choices, setChoices] = useState<Record<string, string>>(initialDraft?.choices ?? defaults);
  const [quantity, setQuantity] = useState<number | null>(initialDraft?.quantity ?? null);
  const [more, setMore] = useState(Boolean(initialDraft?.quantity && !data.quantityPresets.some((preset) => preset.quantity === initialDraft.quantity)));
  const [custom, setCustom] = useState(initialDraft?.quantity && !data.quantityPresets.some((preset) => preset.quantity === initialDraft.quantity) ? String(initialDraft.quantity) : "");
  const [artwork, setArtwork] = useState<Artwork | null>(initialDraft?.artwork ?? null);
  const [details, setDetails] = useState<ConfigurationDetails>(initialDraft?.details ?? {});
  const [rush, setRush] = useState<NonNullable<Pending["rush"]>>(initialDraft?.rush ?? "STANDARD");
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
        const { choices: _choices, quantity: _quantity, ...rest } = change;
        void _choices;
        void _quantity;
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
      ...(change.details || pending.current.details ? { details: { ...pending.current.details, ...change.details } } : {}),
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

  const changeDetails = (change: ConfigurationDetails, step: Pending["step"] = "options") => {
    setDetails((current) => ({ ...current, ...change }));
    queue({ details: change, step });
  };

  const chooseRush = (value: NonNullable<Pending["rush"]>) => {
    setRush(value);
    queue({ rush: value, step: "delivery" });
  };

  /** Saves anything waiting and returns the draft (for the quote request). */
  const ensure = async () => {
    if (timer.current) clearTimeout(timer.current);
    await flush();
    return draftRef.current;
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
  const shownState = price?.state ?? listState;
  const state = shownState ? STATE_LABEL[shownState] : null;
  const blockingReasons = price?.reasons.filter((reason) => reason.blocking) ?? [];
  const summary = [quantity ? `${quantity.toLocaleString("en-NG")}` : null, ...data.options.map((option) => valueLabel(option.key, choices[option.key]))].filter(Boolean).join(" · ");
  const steps = [...data.options.map((option) => `option-${option.key}`), "quantity", "artwork", "delivery", "review"];
  const number = (step: string) => String(steps.indexOf(step) + 1).padStart(2, "0");
  const presetPrices = data.quantityPresets.flatMap((preset) => (preset.perUnitMinor ? [BigInt(preset.perUnitMinor)] : []));
  const cheaperFrom = presetPrices.length > 1 && presetPrices[presetPrices.length - 1]! < presetPrices[0]! ? data.quantityPresets[1]?.quantity : null;

  return (
    <div className={styles.configurator}>
      {state ? (
        <span className={`${p.stateChip} ${state.className}`}>
          {shownState === "PRICE_READY" ? <CircleCheck size={14} aria-hidden="true" /> : null}
          {state.label}
        </span>
      ) : data.fromPerUnitMinor ? (
        <span className={`${p.stateChip} ${styles.stateReady}`}>FROM {naira(data.fromPerUnitMinor, data.currency)} EACH</span>
      ) : null}

      <div id="step-options" className={p.steps}>
        {data.options.map((option) => (
          <fieldset key={option.key} className={p.step}>
            <legend className={p.stepHead}>
              <span className={p.stepNum}>{number(`option-${option.key}`)}</span>
              <span className={p.stepTitle}>{option.label}</span>
            </legend>
            <div className={p.cards}>
              {option.values.map((value) => {
                const blocked = blockedReason(option.key, value.key);
                const id = `choice-${option.key}-${value.key}`;
                const label = splitLabel(value.label);
                return (
                  <label key={value.key} className={p.card} htmlFor={id}>
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
                    <span className={p.cardTitle}>{label.title}</span>
                    {blocked ? (
                      <span className={p.cardMeta} id={`${id}-blocked`}>
                        Not available with your choices
                      </span>
                    ) : label.meta ? (
                      <span className={p.cardMeta}>{label.meta}</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            {option.values.some((value) => blockedReason(option.key, value.key)) ? (
              <p className={p.hint}>{option.values.map((value) => blockedReason(option.key, value.key)).find(Boolean)}</p>
            ) : null}
          </fieldset>
        ))}
        <FamilyFields family={family} details={details} onChange={(change) => changeDetails(change)} />
      </div>

      <fieldset className={p.step} id="step-quantity">
        <legend className={p.stepHead}>
          <span className={p.stepNum}>{number("quantity")}</span>
          <span className={p.stepTitle}>Quantity</span>
          <span className={p.stepAside}>{cheaperFrom ? `Lower price each at ${cheaperFrom.toLocaleString("en-NG")}+` : `Minimum ${data.moq.toLocaleString("en-NG")}`}</span>
        </legend>
        <div className={p.cards}>
          {data.quantityPresets.map((preset) => (
            <label key={preset.quantity} className={`${p.card} ${p.qty}`} htmlFor={`quantity-${preset.quantity}`}>
              <input
                id={`quantity-${preset.quantity}`}
                type="radio"
                name="quantity"
                checked={quantity === preset.quantity && !more}
                onChange={() => {
                  setMore(false);
                  setCustom("");
                  chooseQuantity(preset.quantity);
                }}
              />
              <span className={p.qtyNumber}>{preset.quantity.toLocaleString("en-NG")}</span>
              {preset.perUnitMinor ? <span className={p.cardMeta}>{naira(preset.perUnitMinor, data.currency)} each</span> : null}
            </label>
          ))}
          <label className={`${p.card} ${p.qty}`} htmlFor="quantity-more">
            <input id="quantity-more" type="radio" name="quantity" checked={more} onChange={() => setMore(true)} />
            <span className={p.qtyNumber}>More</span>
            <span className={p.cardMeta}>Any amount</span>
          </label>
        </div>
        {more ? (
          <div className={p.custom}>
            <FormField label="Or enter a quantity" id="custom-quantity" hint={`Minimum ${data.moq.toLocaleString("en-NG")}. Prices include VAT.`}>
              <TextField
                inputMode="numeric"
                value={custom}
                autoFocus
                onChange={(event) => {
                  const text = event.target.value.replace(/\D/g, "").slice(0, 8);
                  setCustom(text);
                  chooseQuantity(text ? Number(text) : null);
                }}
              />
            </FormField>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={p.step} id="step-artwork">
        <legend className={p.stepHead}>
          <span className={p.stepNum}>{number("artwork")}</span>
          <span className={p.stepTitle}>Artwork</span>
        </legend>
        <div className={p.cards}>
          {ARTWORK.map((option) => (
            <label key={option.value} className={`${p.card} ${p.iconCard}`} htmlFor={`artwork-${option.value}`}>
              <input id={`artwork-${option.value}`} type="radio" name="artwork" checked={artwork === option.value} onChange={() => chooseArtwork(option.value)} />
              <option.Icon size={18} aria-hidden="true" />
              <span className={p.iconText}>
                <span className={p.cardTitle}>{option.title}</span>
                <span className={p.cardMeta}>{option.meta}</span>
              </span>
            </label>
          ))}
        </div>
        {artwork === "UPLOAD" ? <p className={p.hint}>You&apos;ll upload your file when you order. We check it and send a proof before printing.</p> : null}
      </fieldset>

      <section className={p.step} id="step-delivery" aria-labelledby="delivery-title">
        <h2 id="delivery-title" className={p.stepHead}>
          <span className={p.stepNum}>{number("delivery")}</span>
          <span className={p.stepTitle}>Delivery</span>
        </h2>
        <DeliveryFields draft={draft} details={details} rush={rush} onChange={(change) => changeDetails(change, "delivery")} onRush={chooseRush} />
        <p className={p.hint}>Delivery cost and pickup are confirmed at checkout for your address.</p>
      </section>

      <section className={p.step} id="step-review" aria-labelledby="review-title">
        <h2 id="review-title" className={p.stepHead}>
          <span className={p.stepNum}>{number("review")}</span>
          <span className={p.stepTitle}>Review</span>
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

      <div className={p.total} ref={totalBar} aria-live="polite">
        <div className={p.totalRow}>
          <div className={p.totalText}>
            <p className={p.summary}>{summary.toUpperCase()}</p>
            <p className={p.perUnit}>{price?.perUnitMinor ? `${naira(price.perUnitMinor, price.currency)} each, including VAT` : "Choose a quantity to see the price"}</p>
          </div>
          <p className={p.amount}>{price?.totalMinor ? naira(price.totalMinor, price.currency) : "—"}</p>
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
        {price?.state === "PRICE_READY" && !blockingReasons.length && !draft?.quote ? (
          <button type="button" className={p.add} disabled title="Online checkout opens soon">
            Add to bag
          </button>
        ) : (
          <QuoteRequest draft={draft} ensure={ensure} onRequested={(reference) => void api(`/v1/configurations/${draftRef.current!.id}`, { response: configurationSchema }).then(setDraft).catch(() => setNotice(`Quote requested: ${reference}.`))} />
        )}
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
          <p className={p.production}>
            <Truck size={16} aria-hidden="true" />
            Typical production {data.leadDays.min}–{data.leadDays.max} working days after artwork and proof approval
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
