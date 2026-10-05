"use client";

import { type AnswerConflict, ApiError, type Configuration, type ConfigurationDetails, configurationSchema, type Configurator as ConfiguratorData, type PriceResult } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextField } from "@holypearls/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, errorCode, errorReason } from "../../lib/api";
import s from "./ledger-pdp.module.css";
import { ArrowRight, Check, Clock, Lock, PenTool, Upload } from "lucide-react";
import { AddToCart } from "../sales/AddToCart";
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

/** Option labels carry an optional second line after " · " ("Standard matte · Smooth and practical, 350gsm"), shown as Pen's card meta. */
const splitLabel = (label: string) => {
  const at = label.indexOf(" · ");
  return at > 0 ? { title: label.slice(0, at), meta: label.slice(at + 3) } : { title: label, meta: null };
};

/** The state pill above the title (Pen gb4rz "Fixed price"; mfOQO "≈ Estimate"). */
const STATE_LABEL: Record<PriceResult["state"], { label: string; className: string }> = {
  PRICE_READY: { label: "Fixed price", className: s.pillReady! },
  ESTIMATE_READY: { label: "≈ Estimate", className: s.pillEstimate! },
  QUOTE_REQUIRED: { label: "Quote needed", className: s.pillQuote! },
  CONSULTATION_REQUIRED: { label: "Planned with our team", className: s.pillQuote! },
};

interface Props {
  productSlug: string;
  productName: string;
  family: string;
  data: ConfiguratorData;
  /** The list price state, for the chip before anything is chosen (Pen 21 "PRICE READY · ORDER NOW"). */
  listState?: "PRICE_READY" | "ESTIMATE_READY" | null;
  initialDraft: Configuration | null;
  /** Title, summary and facts (server-rendered), shown under the state pill. */
  head?: ReactNode;
}

/**
 * The inline configurator (Pen 21, COM-FR-010–014 and 040–044): Options →
 * Quantity → Artwork → Delivery → Review on one page. Every change autosaves
 * to a draft; the price sits next to the choices; combinations we can't make
 * are blocked before Review; a change that would remove later answers is
 * shown for confirmation first.
 */
export function Configurator({ productSlug, productName, family, data, initialDraft, listState = null, head }: Props) {
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

  const vatRate = price?.vatRateBps != null ? `${(price.vatRateBps / 100).toLocaleString("en-NG")}%` : null;
  // Fixed-price products show checkout from the start; anything else ends in a quote (COM-FR-044, 061).
  const ready = (price?.state ?? listState) === "PRICE_READY" && !blockingReasons.length && !draft?.quote;
  const cols = (count: number) => (count >= 4 ? s.tiles4 : count === 3 ? s.tiles3 : "");

  return (
    <>
      <div className={s.head}>
        {state ? (
          <div className={s.stateRow}>
            <span className={`${s.pill} ${state.className}`}>
              {shownState === "PRICE_READY" ? <Check size={14} aria-hidden="true" /> : null}
              {state.label}
            </span>
          </div>
        ) : data.fromPerUnitMinor ? (
          <div className={s.stateRow}>
            <span className={`${s.pill} ${s.pillReady}`}>From {naira(data.fromPerUnitMinor, data.currency)} each</span>
          </div>
        ) : null}
        {head}
      </div>

      <div id="step-options" className={s.optionGroups} data-no-reveal>
        {data.options.map((option) => {
          // Options whose values carry a spec ("Soft matte · 350gsm") read as a list, spec on the right (Pen "How should it feel?").
          const listed = option.values.some((value) => splitLabel(value.label).meta) && option.values.length <= 4;
          return (
            <fieldset key={option.key} className={s.group}>
              <legend className={s.legend}>
                <span className={s.legendNum}>{number(`option-${option.key}`)}</span>
                <span className={s.legendTitle}>{option.label}</span>
              </legend>
              <div className={listed ? s.list : `${s.tiles} ${cols(option.values.length)}`}>
                {option.values.map((value) => {
                  const blocked = blockedReason(option.key, value.key);
                  const id = `choice-${option.key}-${value.key}`;
                  const label = splitLabel(value.label);
                  return (
                    <label key={value.key} className={`${s.tile} ${listed ? s.tileRow : ""}`} htmlFor={id}>
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
                      <span className={s.tileTitle}>{label.title}</span>
                      {blocked ? (
                        <span className={s.tileMeta} id={`${id}-blocked`}>
                          Not available with your choices
                        </span>
                      ) : label.meta ? (
                        <span className={listed ? s.tileSpec : s.tileMeta}>{label.meta}</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              {option.values.some((value) => blockedReason(option.key, value.key)) ? (
                <p className={s.hint}>{option.values.map((value) => blockedReason(option.key, value.key)).find(Boolean)}</p>
              ) : null}
            </fieldset>
          );
        })}
        <FamilyFields family={family} details={details} onChange={(change) => changeDetails(change)} />
      </div>

      <fieldset className={s.group} id="step-quantity">
        <legend className={s.legend}>
          <span className={s.legendNum}>{number("quantity")}</span>
          <span className={s.legendTitle}>Quantity</span>
          <span className={s.legendAside}>{cheaperFrom ? `Lower price each at ${cheaperFrom.toLocaleString("en-NG")}+` : `Minimum ${data.moq.toLocaleString("en-NG")}`}</span>
        </legend>
        <div className={`${s.tiles} ${cols(data.quantityPresets.length + 1)}`}>
          {data.quantityPresets.map((preset) => (
            <label key={preset.quantity} className={s.tile} htmlFor={`quantity-${preset.quantity}`}>
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
              <span className={s.tileBig}>{preset.quantity.toLocaleString("en-NG")}</span>
              {preset.perUnitMinor ? <span className={s.tileMeta}>{naira(preset.perUnitMinor, data.currency)} each</span> : null}
            </label>
          ))}
          <label className={s.tile} htmlFor="quantity-more">
            <input id="quantity-more" type="radio" name="quantity" checked={more} onChange={() => setMore(true)} />
            <span className={s.tileBig}>More</span>
            <span className={s.tileMeta}>Any amount</span>
          </label>
        </div>
        {more ? (
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
        ) : null}
      </fieldset>

      <fieldset className={s.group} id="step-artwork">
        <legend className={s.legend}>
          <span className={s.legendNum}>{number("artwork")}</span>
          <span className={s.legendTitle}>Artwork</span>
        </legend>
        <div className={`${s.tiles} ${s.tiles3}`}>
          {ARTWORK.map((option) => (
            <label key={option.value} className={s.tile} htmlFor={`artwork-${option.value}`}>
              <input id={`artwork-${option.value}`} type="radio" name="artwork" checked={artwork === option.value} onChange={() => chooseArtwork(option.value)} />
              <span className={s.tileTitle}>{option.title}</span>
              <span className={s.tileMeta}>{option.meta}</span>
            </label>
          ))}
        </div>
        {artwork === "UPLOAD" ? (
          <div className={s.dropZone}>
            <Upload size={22} aria-hidden="true" />
            <p className={s.hint}>You&apos;ll upload your file when you order. JPEG, PNG or PDF. We check it and send a proof before printing.</p>
          </div>
        ) : null}
      </fieldset>

      <section className={s.group} id="step-delivery" aria-labelledby="delivery-title">
        <h2 id="delivery-title" className={s.legend}>
          <span className={s.legendNum}>{number("delivery")}</span>
          <span className={s.legendTitle}>Delivery</span>
        </h2>
        <DeliveryFields draft={draft} details={details} rush={rush} onChange={(change) => changeDetails(change, "delivery")} onRush={chooseRush} />
        <p className={s.hint}>Delivery cost and pickup are confirmed at checkout for your address.</p>
      </section>

      <section className={s.group} id="step-review" aria-labelledby="review-title">
        <h2 id="review-title" className={s.legend}>
          <span className={s.legendNum}>{number("review")}</span>
          <span className={s.legendTitle}>Review</span>
        </h2>
        <dl className={s.specs}>
          {data.options.map((option) => (
            <div key={option.key}>
              <dt>{option.label}</dt>
              <dd>
                {valueLabel(option.key, choices[option.key])}{" "}
                <a className={s.textButton} href="#step-options">
                  Edit<span className="hp-visually-hidden"> {option.label.toLowerCase()}</span>
                </a>
              </dd>
            </div>
          ))}
          <div>
            <dt>Quantity</dt>
            <dd>
              {quantity ? quantity.toLocaleString("en-NG") : "Not chosen"}{" "}
              <a className={s.textButton} href="#step-quantity">
                Edit<span className="hp-visually-hidden"> quantity</span>
              </a>
            </dd>
          </div>
          <div>
            <dt>Artwork</dt>
            <dd>
              {ARTWORK.find((option) => option.value === artwork)?.title ?? "Not chosen"}{" "}
              <a className={s.textButton} href="#step-artwork">
                Edit<span className="hp-visually-hidden"> artwork</span>
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section className={s.ticket} ref={totalBar} aria-label="Your price" aria-live="polite" data-no-reveal>
        <div className={s.lines}>
          <span className={s.ticketCaption}>Your {productName.toLowerCase()}</span>
          <div className={`${s.line} ${s.lineMain}`}>
            <span>{summary || "Choose your options"}</span>
            <span>{price?.goodsMinor ? naira(price.goodsMinor, price.currency) : "—"}</span>
          </div>
          {price?.vatMinor ? (
            <div className={s.line}>
              <span>VAT{vatRate ? ` (${vatRate})` : ""}</span>
              <span>{naira(price.vatMinor, price.currency)}</span>
            </div>
          ) : null}
          <div className={s.line}>
            <span>Delivery</span>
            <span>{price?.deliveryMinor ? naira(price.deliveryMinor, price.currency) : "Calculated at checkout"}</span>
          </div>
        </div>
        <div className={s.perf} aria-hidden="true" />
        <div className={`${s.ticketBody} ${s.ticketBodyFixed}`}>
          <div className={s.totalLine}>
            <span className={s.totalLabel}>Total</span>
            <span className={s.totalValue}>
              <strong>{price?.totalMinor ? naira(price.totalMinor, price.currency) : "—"}</strong>
              <span className={s.ticketPer}>{price?.perUnitMinor ? `≈ ${naira(price.perUnitMinor, price.currency)} each incl. VAT` : "Choose a quantity to see the price"}</span>
            </span>
          </div>
          {price?.reasons.some((reason) => reason.code !== "SAMPLE_PRICE") ? (
            <ul className={s.reasons}>
              {price.reasons
                .filter((reason) => reason.code !== "SAMPLE_PRICE")
                .map((reason) => (
                  <li key={reason.code + reason.message} className={reason.blocking ? s.blocking : undefined}>
                    {reason.message}
                  </li>
                ))}
            </ul>
          ) : null}
          <dl className={s.timing}>
            <div>
              <dt>Production</dt>
              <dd>{data.leadDays ? `${data.leadDays.min}–${data.leadDays.max} working days` : "Confirmed with you"}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>Shown after address</dd>
            </div>
          </dl>
          {notice ? (
            <Notice tone="info" title="Heads up" live>
              <p>{notice}</p>
            </Notice>
          ) : null}
          {ready ? (
            draft?.status === "IN_CART" ? (
              <AddToCart draft={draft} ensure={ensure} />
            ) : (
              <>
                <AddToCart draft={draft} ensure={ensure} className={s.primary} label="Checkout now" then="checkout" icon={<Lock size={18} aria-hidden="true" />} />
                <AddToCart draft={draft} ensure={ensure} className={s.secondary} label="Add to cart" />
                <p className={`${s.small} ${s.center}`}>Guest checkout · no account needed. Your design saves as you go.</p>
              </>
            )
          ) : (
            <QuoteRequest
              draft={draft}
              ensure={ensure}
              buttonClassName={s.brandButton}
              onRequested={(reference) => void api(`/v1/configurations/${draftRef.current!.id}`, { response: configurationSchema }).then(setDraft).catch(() => setNotice(`Quote requested: ${reference}.`))}
            >
              <ArrowRight size={18} aria-hidden="true" />
            </QuoteRequest>
          )}
          <div className={s.links}>
            <span className={`${s.saved} ${saveState === "failed" ? s.savedFailed : saveState === "saved" ? "" : s.savedPending}`} role={saveState === "failed" ? "alert" : "status"}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "failed" ? "Not saved — retrying" : ""}
            </span>
            {saveState === "failed" ? (
              <button type="button" className={s.textButton} onClick={() => void flush()}>
                Retry now
              </button>
            ) : null}
            <button type="button" className={s.textButton} onClick={() => setEmailOpen(true)}>
              {draft?.emailedTo ? `Link sent to ${draft.emailedTo} · send again` : "Email me a link to this design"}
            </button>
          </div>
        </div>
      </section>

      <div className={`${s.stickyBar} ${stickyVisible ? s.stickyOn : ""}`} aria-label={`${productName} price`} aria-hidden={!stickyVisible}>
        <span className={s.stickyPrice}>
          <span className={s.stickyCaption}>{quantity ? `${quantity.toLocaleString("en-NG")} · ${price?.state === "PRICE_READY" ? "fixed price" : "estimate"}` : "Choose options"}</span>
          <strong className={s.stickyTotal}>{price?.totalMinor ? naira(price.totalMinor, price.currency) : data.fromPerUnitMinor ? `From ${naira(data.fromPerUnitMinor, data.currency)}` : "—"}</strong>
          {price?.perUnitMinor ? <span className={s.stickyPer}>≈ {naira(price.perUnitMinor, price.currency)} each</span> : null}
        </span>
        <a className={`${s.brandButton} ${s.stickyCta}`} href="#step-review" tabIndex={stickyVisible ? 0 : -1}>
          Review
        </a>
      </div>

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
    </>
  );
}
