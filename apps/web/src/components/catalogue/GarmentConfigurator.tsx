"use client";

import {
  type Configuration,
  type ConfigurationDetails,
  configurationSchema,
  type Configurator as ConfiguratorData,
  type CustomerPriceState,
  DECORATION_LABEL,
  GARMENT_SIZES,
  type PlacementInput,
  type PublicImage,
  personalizationResultSchema,
  SOURCING_LABEL,
  type FileView,
} from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextArea, TextField } from "@holypearls/ui";
import { ArrowRight, Check, CircleAlert, CircleDashed, CloudUpload, RefreshCw, Users } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { FileUpload } from "../FileUpload";
import { AddToCart } from "../sales/AddToCart";
import { DeliveryFields, QuoteRequest } from "./FamilyDelivery";
import { GarmentPreview, POSITION_LABEL, type Position } from "./GarmentPreview";
import s from "./ledger-pdp.module.css";
import { PdpGallery } from "./PdpGallery";
import { useDraft } from "./useDraft";

type Sourcing = NonNullable<NonNullable<Configuration["garment"]>["sourcing"]>;
type Decoration = NonNullable<NonNullable<Configuration["garment"]>["decoration"]>;
type Artwork = NonNullable<Configuration["artwork"]>;

/*
 * Copy only. Which choices a product offers comes from the API
 * (configurator.allowedRoutes, allowedDecorations), which also refuses others.
 */
const SOURCING: Record<Sourcing, { title: string; meta: string }> = {
  SOURCE_CUSTOMIZE: { title: SOURCING_LABEL.SOURCE_CUSTOMIZE, meta: "We supply a quality blank" },
  MAKE_FROM_SCRATCH: { title: SOURCING_LABEL.MAKE_FROM_SCRATCH, meta: "Your fabric, fit and labels" },
  CUSTOMER_SUPPLIED: { title: SOURCING_LABEL.CUSTOMER_SUPPLIED, meta: "Price final after inspection" },
  HELP_ME_CHOOSE: { title: SOURCING_LABEL.HELP_ME_CHOOSE, meta: "Tell us how it'll be worn" },
};

const DECORATION: Record<Decoration, { title: string; meta: string }> = {
  EMBROIDERY: { title: DECORATION_LABEL.EMBROIDERY, meta: "Stitched. Lasts. Premium feel." },
  PRINT: { title: DECORATION_LABEL.PRINT, meta: "Great for large or detailed art" },
  BOTH: { title: DECORATION_LABEL.BOTH, meta: "Embroider some areas, print others" },
  RECOMMEND: { title: DECORATION_LABEL.RECOMMEND, meta: "We choose after seeing your logo" },
};

/**
 * The choices to show: the ones the product offers, plus a saved answer staff
 * have since removed, marked and disabled so the customer sees what changed
 * and picks another (the draft keeps it until they do).
 */
function visibleChoices<T extends string>(allowed: T[], saved: T | null) {
  return [...allowed.map((value) => ({ value, gone: false })), ...(saved && !allowed.includes(saved) ? [{ value: saved, gone: true }] : [])];
}

const ARTWORK: { value: Artwork; title: string; meta: string }[] = [
  { value: "LOGO", title: "Upload my logo", meta: "We place it for you" },
  { value: "UPLOAD", title: "Upload ready artwork", meta: "Print-ready PDF works best" },
  { value: "REFERENCE", title: "Upload a reference image", meta: "A photo or sketch of what you want" },
  { value: "DESIGN_HELP", title: "I need design help", meta: "We'll contact you with options" },
  { value: "LATER", title: "Send it later", meta: "Held for artwork" },
];

const ROLE_FOR: Record<string, "ARTWORK" | "LOGO" | "REFERENCE"> = { UPLOAD: "ARTWORK", LOGO: "LOGO", REFERENCE: "REFERENCE" };

/** Six steady steps (COM-FR-010; Pen mfOQO). `key` is the step the draft remembers (API names). */
const STEPS = [
  { name: "Garment", key: "product" },
  { name: "Decoration", key: "customize" },
  { name: "Placement", key: "customize" },
  { name: "Sizes & quantity", key: "quantity" },
  { name: "Artwork", key: "artwork" },
  { name: "Review", key: "review" },
] as const;

/** The step a saved draft reopens on. */
const STEP_FOR_KEY: Record<string, number> = { product: 0, customize: 2, quantity: 3, artwork: 4, delivery: 5, review: 5 };

const naira = (minor: string | null | undefined) => {
  if (!minor) return "—";
  const value = BigInt(minor);
  const kobo = value % 100n;
  return `₦${(value / 100n).toLocaleString("en-NG")}${kobo ? `.${kobo.toString().padStart(2, "0")}` : ""}`;
};

interface Props {
  productSlug: string;
  productName: string;
  data: ConfiguratorData;
  images: PublicImage[];
  initialDraft: Configuration | null;
  signedIn: boolean;
  /** A route or colour carried in the address (only ones the product offers). */
  startSourcing?: Sourcing | null;
  startChoices?: Record<string, string>;
  /** The product's list price state, for the pill before anything is priced. */
  listState: CustomerPriceState;
  crumbs: ReactNode;
  head: ReactNode;
}

/**
 * Garment product page and configurator in one (Pen mfOQO desktop, Q7ml3
 * phone; COM-FR-010–014, 020–029, 050–054, 060–061): the garment map beside
 * six expanding steps, then a price ticket. Every change autosaves to the
 * draft; nothing is lost when a choice needs a quote.
 */
export function GarmentConfigurator({ productSlug, productName, data, images, initialDraft, signedIn, startSourcing = null, startChoices = {}, listState, crumbs, head }: Props) {
  const defaults = { ...Object.fromEntries(data.options.map((option) => [option.key, (option.values.find((value) => value.isDefault) ?? option.values[0])?.key ?? ""])), ...startChoices };
  const { draft, apply, saveState, notice, setNotice, conflicts, resolveConflicts, queue, flush, ensure, draftRef } = useDraft(productSlug, initialDraft, defaults);
  const garment = draft?.garment ?? null;

  const [choices, setChoices] = useState<Record<string, string>>(initialDraft?.choices ?? defaults);
  const [sourcing, setSourcing] = useState<Sourcing | null>(garment?.sourcing ?? startSourcing ?? (data.allowedRoutes.length === 1 ? data.allowedRoutes[0]! : null));
  const [decoration, setDecoration] = useState<Decoration | null>(garment?.decoration ?? null);
  const [details, setDetails] = useState<Record<string, string | boolean>>((garment?.details as Record<string, string | boolean>) ?? {});
  const [delivery, setDelivery] = useState<ConfigurationDetails>(initialDraft?.details ?? {});
  const [rush, setRush] = useState(initialDraft?.rush ?? "STANDARD");
  const [placements, setPlacements] = useState<PlacementInput[]>(garment?.placements ?? []);
  const [sizes, setSizes] = useState<Record<string, number>>(Object.fromEntries((garment?.sizes ?? []).map((item) => [item.size, item.quantity])));
  const [sizesUnknown, setSizesUnknown] = useState(garment?.sizesUnknown ?? false);
  const [total, setTotal] = useState(initialDraft?.quantity ? String(initialDraft.quantity) : "");
  const [artwork, setArtwork] = useState<Artwork | null>(initialDraft?.artwork ?? null);
  const [view, setView] = useState<"front" | "back">("front");
  const [csv, setCsv] = useState<{ accepted: boolean; count: number; errors: { row: number; field: string; message: string }[] } | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [uploadKey, setUploadKey] = useState(0);
  const first = initialDraft?.step && STEP_FOR_KEY[initialDraft.step] !== undefined ? STEP_FOR_KEY[initialDraft.step]! : startSourcing ? 1 : 0;
  const [open, setOpen] = useState<number[]>([first]);
  const [stickyVisible, setStickyVisible] = useState(false);
  const ticket = useRef<HTMLElement>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  // A route carried in the address is saved as soon as the page opens.
  useEffect(() => {
    if (!initialDraft && startSourcing) queue({ sourcing: startSourcing, step: "customize" }, 0);
  }, []);

  // The phone price bar shows while the ticket is off screen (COM-FR-002).
  useEffect(() => {
    const element = ticket.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry!.isIntersecting && entry!.boundingClientRect.top > 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toggle = (index: number) => setOpen((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]));

  /** "Continue": closes this step, opens the next and brings it into view. */
  const next = (index: number) => {
    const following = index + 1;
    setOpen((current) => [...current.filter((item) => item !== index), following]);
    queue({ step: STEPS[following]!.key }, 0);
    requestAnimationFrame(() => stepRefs.current[following]?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const price = draft?.price ?? null;
  const serverConflicts = garment?.conflicts ?? [];
  const canUpload = signedIn || Boolean(draft?.emailedTo);
  const artworkLaterAllowed = draft?.artworkLaterAllowed ?? true;
  const unavailable = garment?.unavailable ?? [];
  const goneMessage = (field: string) => unavailable.find((item) => item.field === field)?.message;
  const placementMethods = (["EMBROIDERY", "PRINT"] as const).filter((method) => data.allowedDecorations.includes(method));
  const colourOption = data.options.find((option) => option.key === "colour");
  const colourValue = colourOption?.values.find((value) => value.key === choices.colour);

  const setDetail = (key: string, value: string | boolean) => {
    setDetails({ ...details, [key]: value });
    queue({ details: { [key]: value }, step: "product" }, 800);
  };

  const togglePlacement = (position: Position) => {
    const exists = placements.some((placement) => placement.position === position);
    const nextPlacements = exists ? placements.filter((placement) => placement.position !== position) : [...placements, { position, size: "STANDARD" as const, method: null, note: null }];
    setPlacements(nextPlacements);
    queue({ placements: nextPlacements, step: "customize" });
  };

  const updatePlacement = (position: Position, change: Partial<PlacementInput>) => {
    const nextPlacements = placements.map((placement) => (placement.position === position ? { ...placement, ...change } : placement));
    setPlacements(nextPlacements);
    queue({ placements: nextPlacements, step: "customize" }, change.note !== undefined ? 800 : 400);
  };

  /** Applies one conflict fix; other placements stay as they are (COM-FR-026). */
  const fix = (position: Position, change: Record<string, unknown>) => {
    if (change.remove) togglePlacement(position);
    else updatePlacement(position, change as Partial<PlacementInput>);
  };

  const setSize = (size: string, quantity: number) => {
    const nextSizes = { ...sizes, [size]: Math.max(0, Math.min(quantity, 999_999)) };
    setSizes(nextSizes);
    queue({ sizes: GARMENT_SIZES.map((item) => ({ size: item, quantity: nextSizes[item] ?? 0 })), step: "quantity" }, 700);
  };

  const attach = async (file: FileView | null) => {
    if (!file || !artwork || !ROLE_FOR[artwork]) return;
    const current = await ensure();
    if (!current) return;
    try {
      apply(await api(`/v1/configurations/${current.id}/files`, { method: "POST", body: { fileId: file.id, role: ROLE_FOR[artwork] }, response: configurationSchema }));
      setUploadKey((key) => key + 1);
    } catch {
      setNotice("We couldn't attach that file. Try uploading it again.");
    }
  };

  const importCsv = async (file: FileView | null) => {
    if (!file) return;
    const current = await ensure();
    if (!current) return;
    const result = await api(`/v1/configurations/${current.id}/personalization`, { method: "POST", body: { fileId: file.id }, response: personalizationResultSchema });
    setCsv(result);
    apply(await api(`/v1/configurations/${current.id}`, { response: configurationSchema }));
  };

  const lowResAction = async (linkId: string, action: "REPLACE" | "CLEANUP" | "REVIEW") => {
    if (!draft) return;
    apply(await api(`/v1/configurations/${draft.id}/files/${linkId}/low-resolution`, { method: "POST", body: { action }, response: configurationSchema }));
    if (action === "REPLACE") setUploadKey((key) => key + 1);
  };

  const removeFile = async (linkId: string) => {
    if (!draft) return;
    apply(await api(`/v1/configurations/${draft.id}/files/${linkId}`, { method: "DELETE", response: configurationSchema }));
  };

  const sendEmail = async () => {
    setEmailError(undefined);
    const current = await ensure();
    if (!current) return;
    try {
      apply(await api(`/v1/configurations/${current.id}/email`, { method: "POST", body: { email }, response: configurationSchema }));
      setEmailOpen(false);
      setNotice("We've emailed you a link to this design. You can upload files now.");
    } catch {
      setEmailError("We couldn't send it. Check the address and try again.");
    }
  };

  const sizeTotal = Object.values(sizes).reduce((sum, value) => sum + value, 0);
  const pieces = sizesUnknown ? Number(total || 0) : sizeTotal;
  const conflictFor = (position: Position) => serverConflicts.some((conflict) => conflict.positions.includes(position));
  const placeSummary = placements.map((placement) => POSITION_LABEL[placement.position]).join(", ");

  /** Each step's one-line summary and whether it's answered (the badge). */
  const status = [
    { done: Boolean(sourcing), summary: [sourcing ? SOURCING[sourcing].title : null, sourcing === "SOURCE_CUSTOMIZE" || sourcing === null ? colourValue?.label : null].filter(Boolean).join(" · ") || "Not chosen" },
    { done: Boolean(decoration), summary: decoration ? DECORATION[decoration].title : "Not chosen" },
    { done: placements.length > 0 && !serverConflicts.length, summary: placeSummary || "Choose at least one" },
    { done: pieces >= data.moq, summary: sizesUnknown ? `Sizes later · about ${pieces || 0} pieces` : pieces ? `${pieces} pieces` : `Minimum ${data.moq}` },
    { done: Boolean(artwork), summary: ARTWORK.find((item) => item.value === artwork)?.title ?? "Not started" },
    { done: Boolean(draft?.quote), summary: "Every choice, with an edit link" },
  ];
  const now = open.length ? Math.min(...open) : status.findIndex((item) => !item.done);

  const save =
    saveState === "failed"
      ? { tone: s.savedFailed, icon: <RefreshCw size={14} aria-hidden="true" />, text: "Not saved — retrying" }
      : saveState === "saving"
        ? { tone: s.savedPending, icon: <CloudUpload size={14} aria-hidden="true" />, text: "Saving…" }
        : saveState === "saved" && draft
          ? { tone: "", icon: <Check size={14} aria-hidden="true" />, text: draft.emailedTo ? "Saved. We'll email you a link to come back." : "Draft saved" }
          : { tone: s.savedPending, icon: <CircleDashed size={14} aria-hidden="true" />, text: "Not saved yet" };

  const priceState = price?.state ?? (listState === "PRICE_READY" || listState === "ESTIMATE_READY" ? listState : "QUOTE_REQUIRED");
  const pill =
    priceState === "PRICE_READY"
      ? { label: "Fixed price", className: s.pillReady }
      : priceState === "ESTIMATE_READY"
        ? { label: "≈ Estimate", className: s.pillEstimate }
        : { label: "Quote needed", className: s.pillQuote };
  const quoteReasons = price?.state === "QUOTE_REQUIRED" ? price.reasons.filter((reason) => !reason.blocking) : [];
  // Blocking reasons always sit in the ticket; the others too, unless the quote notice above already says them.
  const ticketReasons = price?.reasons.filter((reason) => reason.blocking || price.state !== "QUOTE_REQUIRED") ?? [];
  const caption = `${priceState === "QUOTE_REQUIRED" ? "Quote needed" : priceState === "PRICE_READY" ? "Price" : "Estimate"} · ${sizesUnknown ? `about ${pieces || 0}` : pieces} pieces`;

  const stepBody = (index: number, children: ReactNode) => (
    <div className={s.stepBody} id={`step-${index}`} role="region" aria-labelledby={`step-${index}-head`} hidden={!open.includes(index)}>
      {children}
      {index < STEPS.length - 1 ? (
        <button type="button" className={s.continue} onClick={() => next(index)}>
          Continue to {STEPS[index + 1]!.name.toLowerCase()}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  const map = (
    <div className={s.mapWrap}>
      <div className={s.viewToggle} role="group" aria-label="Garment side">
        {(["front", "back"] as const).map((side) => (
          <button key={side} type="button" className={s.viewButton} aria-pressed={view === side} onClick={() => setView(side)}>
            {side === "front" ? "Front" : "Back"}
          </button>
        ))}
      </div>
      <GarmentPreview view={view} placements={placements} conflicts={serverConflicts} onToggle={togglePlacement} fill={colourValue?.swatch} photo={colourValue?.image?.url} />
    </div>
  );

  return (
    <>
      <div className={s.crumbRow}>
        {crumbs}
        <span className={`${s.saved} ${save.tone}`} role="status">
          {save.icon}
          {save.text}
        </span>
      </div>
      <section className={s.split} aria-labelledby="product-title">
        <div className={s.stickyCol}>
          <PdpGallery images={images} name={productName} slug={productSlug} tint="brand" preview={{ label: "MAP", node: map, note: "Approximate preview. You'll approve a production proof." }} />
        </div>

        <div className={s.side}>
          <div className={s.head}>
            <div className={s.stateRow}>
              <span className={`${s.pill} ${pill.className}`}>{pill.label}</span>
            </div>
            {head}
          </div>

          <nav className={s.strip} aria-label="Configuration steps">
            <ol className={s.bars}>
              {STEPS.map((step, index) => (
                <li key={step.name} className={`${s.bar} ${index === now ? s.barNow : status[index]!.done ? s.barDone : ""}`} />
              ))}
            </ol>
            <p className={s.stripText}>
              <span className={s.stripCount}>
                STEP {now + 1} OF {STEPS.length}
              </span>
              <span className={s.stripNames}>
                {STEPS.map((step, index) => (
                  <span key={step.name}>
                    {index ? " · " : ""}
                    {index === now ? <b>{step.name}</b> : step.name}
                  </span>
                ))}
              </span>
            </p>
          </nav>

          <ol className={s.steps} data-no-reveal>
            {STEPS.map((step, index) => (
              <li
                key={step.name}
                className={s.stepItem}
                ref={(element) => {
                  stepRefs.current[index] = element;
                }}
              >
                <h2 className={s.stepH}>
                  <button
                    type="button"
                    id={`step-${index}-head`}
                    className={s.stepHead}
                    aria-expanded={open.includes(index)}
                    aria-controls={`step-${index}`}
                    onClick={() => toggle(index)}
                  >
                    <span className={`${s.badge} ${status[index]!.done && index !== now ? s.badgeDone : index === now || open.includes(index) ? s.badgeNow : ""}`} aria-hidden="true">
                      {status[index]!.done && index !== now ? <Check size={14} /> : index + 1}
                    </span>
                    <span className={s.stepName}>{step.name}</span>
                    <span className={s.stepSummary}>{status[index]!.summary}</span>
                  </button>
                </h2>

                {index === 0
                  ? stepBody(
                      0,
                      <>
                        {goneMessage("sourcing") ? (
                          <Notice tone="warning" title="Choose another way to make it" live>
                            <p>{goneMessage("sourcing")}</p>
                          </Notice>
                        ) : null}
                        <fieldset className={s.group}>
                          <legend className="hp-visually-hidden">How should we make it?</legend>
                          <div className={s.tiles}>
                            {visibleChoices(data.allowedRoutes, garment?.sourcing ?? null).map(({ value, gone }) => (
                              <label key={value} className={s.tile} htmlFor={`sourcing-${value}`}>
                                <input
                                  id={`sourcing-${value}`}
                                  type="radio"
                                  name="sourcing"
                                  checked={sourcing === value}
                                  disabled={gone}
                                  onChange={() => {
                                    setSourcing(value);
                                    queue({ sourcing: value, step: "product" });
                                  }}
                                />
                                <span className={s.tileTitle}>{SOURCING[value].title}</span>
                                <span className={s.tileMeta}>{gone ? "No longer available for this product" : SOURCING[value].meta}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        {sourcing === "SOURCE_CUSTOMIZE" || sourcing === null
                          ? data.options.map((option) =>
                              option.key === "colour" ? (
                                <fieldset key={option.key} className={s.group}>
                                  <legend className={s.subhead}>
                                    {option.label} · {option.values.find((value) => value.key === choices[option.key])?.label ?? "Not chosen"}
                                  </legend>
                                  <div className={s.swatches}>
                                    {option.values.map((value) => (
                                      <label key={value.key} className={s.swatch} style={{ background: value.swatch ?? undefined }} title={value.label}>
                                        <input
                                          type="radio"
                                          name={`option-${option.key}`}
                                          aria-label={value.label}
                                          checked={choices[option.key] === value.key}
                                          onChange={() => {
                                            setChoices({ ...choices, [option.key]: value.key });
                                            queue({ choices: { [option.key]: value.key }, step: "product" });
                                          }}
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                              ) : (
                                <fieldset key={option.key} className={s.group}>
                                  <legend className={s.subhead}>{option.label}</legend>
                                  <div className={s.chips}>
                                    {option.values.map((value) => (
                                      <label key={value.key} className={s.chip} htmlFor={`choice-${option.key}-${value.key}`}>
                                        <input
                                          id={`choice-${option.key}-${value.key}`}
                                          type="radio"
                                          name={`option-${option.key}`}
                                          checked={choices[option.key] === value.key}
                                          onChange={() => {
                                            setChoices({ ...choices, [option.key]: value.key });
                                            queue({ choices: { [option.key]: value.key }, step: "product" });
                                          }}
                                        />
                                        {value.label}
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                              ),
                            )
                          : null}
                        {sourcing === "MAKE_FROM_SCRATCH" ? (
                          <>
                            <FormField label="What should we make? (reference)" id="detail-reference" hint="Describe it, or add a reference picture in Artwork.">
                              <TextArea value={(details.reference as string) ?? ""} onChange={(event) => setDetail("reference", event.target.value)} />
                            </FormField>
                            <div className={s.tiles}>
                              {(["fit", "fabric", "colour", "labels"] as const).map((key) => (
                                <FormField key={key} label={{ fit: "Fit", fabric: "Fabric", colour: "Colour", labels: "Labels" }[key]} id={`detail-${key}`}>
                                  <TextField value={(details[key] as string) ?? ""} onChange={(event) => setDetail(key, event.target.value)} />
                                </FormField>
                              ))}
                            </div>
                            <label className={s.toggle} htmlFor="detail-sample">
                              <input id="detail-sample" type="checkbox" checked={Boolean(details.sampleFirst)} onChange={(event) => setDetail("sampleFirst", event.target.checked)} />
                              <span className={s.toggleCopy}>
                                <span className={s.tileTitle}>Make a sample first</span>
                                <span className={s.tileMeta}>Approve one piece before the full run</span>
                              </span>
                              <span className={s.toggleState}>{details.sampleFirst ? "✓ ON" : "OFF"}</span>
                            </label>
                          </>
                        ) : null}
                        {sourcing === "CUSTOMER_SUPPLIED" ? (
                          <>
                            <FormField label="What are you sending?" id="detail-supplied" hint="Type, colours, how many. Add photos in Artwork.">
                              <TextArea value={(details.suppliedItems as string) ?? ""} onChange={(event) => setDetail("suppliedItems", event.target.value)} />
                            </FormField>
                            <fieldset className={s.group}>
                              <legend className={s.subhead}>How we receive them</legend>
                              <div className={s.chips}>
                                {(
                                  [
                                    ["DROP_OFF", "I'll drop them off"],
                                    ["PICKUP", "Pick them up"],
                                    ["COURIER", "I'll send by courier"],
                                  ] as const
                                ).map(([value, label]) => (
                                  <label key={value} className={s.chip} htmlFor={`receive-${value}`}>
                                    <input id={`receive-${value}`} type="radio" name="receive" checked={details.receiveMethod === value} onChange={() => setDetail("receiveMethod", value)} />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <p className={s.hint}>The price is final after we inspect your garments.</p>
                          </>
                        ) : null}
                        {sourcing === "HELP_ME_CHOOSE" ? (
                          <FormField label="What is it for?" id="detail-purpose" hint="For example: 30 front-of-house staff, hot kitchen, smart look.">
                            <TextArea value={(details.reference as string) ?? ""} onChange={(event) => setDetail("reference", event.target.value)} />
                          </FormField>
                        ) : null}
                      </>,
                    )
                  : null}

                {index === 1
                  ? stepBody(
                      1,
                      <>
                        {goneMessage("decoration") ? (
                          <Notice tone="warning" title="Choose another decoration" live>
                            <p>{goneMessage("decoration")}</p>
                          </Notice>
                        ) : null}
                        <fieldset className={s.group}>
                          <legend className="hp-visually-hidden">Decoration</legend>
                          <div className={s.tiles}>
                            {visibleChoices(data.allowedDecorations, garment?.decoration ?? null).map(({ value, gone }) => (
                              <label key={value} className={s.tile} htmlFor={`decoration-${value}`}>
                                <input
                                  id={`decoration-${value}`}
                                  type="radio"
                                  name="decoration"
                                  checked={decoration === value}
                                  disabled={gone}
                                  onChange={() => {
                                    setDecoration(value);
                                    queue({ decoration: value, step: "customize" });
                                  }}
                                />
                                <span className={s.tileTitle}>{DECORATION[value].title}</span>
                                <span className={s.tileMeta}>{gone ? "No longer available for this product" : DECORATION[value].meta}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </>,
                    )
                  : null}

                {index === 2
                  ? stepBody(
                      2,
                      <>
                        <p className={s.hint}>Tap a position here or on the garment. Choose as many as you need.</p>
                        <fieldset className={s.group}>
                          <legend className="hp-visually-hidden">Placement</legend>
                          <div className={s.chips}>
                            {(Object.keys(POSITION_LABEL) as Position[]).map((position) => (
                              <label key={position} className={s.chip} htmlFor={`placement-${position}`}>
                                <input id={`placement-${position}`} type="checkbox" checked={placements.some((placement) => placement.position === position)} onChange={() => togglePlacement(position)} />
                                {POSITION_LABEL[position]}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        {serverConflicts.map((conflict) => (
                          <div key={conflict.message} className={s.quoteNotice} role="alert">
                            <CircleAlert size={20} aria-hidden="true" />
                            <div className={s.head}>
                              <strong>{conflict.message}</strong>
                              <div className={s.chips}>
                                {conflict.fixes.map((item) => (
                                  <Button key={item.label} variant="secondary" onClick={() => fix(item.position, item.change)}>
                                    {item.label}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                        {placements.map((placement) => (
                          <div key={placement.position} className={s.placement}>
                            <div className={s.placementHead}>
                              <span className={s.tileTitle}>
                                {POSITION_LABEL[placement.position]}
                                {conflictFor(placement.position) ? " · needs a fix" : ""}
                              </span>
                              <button type="button" className={s.textButton} onClick={() => togglePlacement(placement.position)}>
                                Remove<span className="hp-visually-hidden"> {POSITION_LABEL[placement.position].toLowerCase()}</span>
                              </button>
                            </div>
                            <div className={s.chips} role="radiogroup" aria-label={`${POSITION_LABEL[placement.position]} size`}>
                              {(["SMALL", "STANDARD", "LARGE"] as const).map((size) => (
                                <label key={size} className={s.chip} htmlFor={`size-${placement.position}-${size}`}>
                                  <input id={`size-${placement.position}-${size}`} type="radio" name={`size-${placement.position}`} checked={placement.size === size} onChange={() => updatePlacement(placement.position, { size })} />
                                  {size === "SMALL" ? "Small" : size === "STANDARD" ? "Standard" : "Large"}
                                </label>
                              ))}
                            </div>
                            {goneMessage(`placements.${placement.position}`) ? <p className={s.hint}>{goneMessage(`placements.${placement.position}`)}</p> : null}
                            {decoration === "BOTH" || goneMessage(`placements.${placement.position}`) ? (
                              <div className={s.chips} role="radiogroup" aria-label={`${POSITION_LABEL[placement.position]} method`}>
                                {placementMethods.map((method) => (
                                  <label key={method} className={s.chip} htmlFor={`method-${placement.position}-${method}`}>
                                    <input id={`method-${placement.position}-${method}`} type="radio" name={`method-${placement.position}`} checked={placement.method === method} onChange={() => updatePlacement(placement.position, { method })} />
                                    {method === "EMBROIDERY" ? "Embroider" : "Print"}
                                  </label>
                                ))}
                              </div>
                            ) : null}
                            <FormField label={placement.position === "CUSTOM" ? "Where exactly?" : "Text to add (optional)"} id={`note-${placement.position}`}>
                              <TextField value={placement.note ?? ""} maxLength={120} onChange={(event) => updatePlacement(placement.position, { note: event.target.value || null })} />
                            </FormField>
                          </div>
                        ))}
                      </>,
                    )
                  : null}

                {index === 3
                  ? stepBody(
                      3,
                      <>
                        {!sizesUnknown ? (
                          <div className={s.sizes}>
                            {GARMENT_SIZES.map((size) => {
                              const count = sizes[size] ?? 0;
                              return (
                                <div key={size} className={`${s.size} ${count > 0 ? s.sizeOn : ""}`}>
                                  <label className={s.sizeLabel} htmlFor={`size-${size}`}>
                                    {size}
                                  </label>
                                  <input
                                    id={`size-${size}`}
                                    className={s.sizeInput}
                                    data-no-check
                                    inputMode="numeric"
                                    value={count ? String(count) : ""}
                                    placeholder="0"
                                    onChange={(event) => setSize(size, Number(event.target.value.replace(/\D/g, "").slice(0, 6) || 0))}
                                  />
                                  <span className={s.steppers}>
                                    <button type="button" className={s.stepper} aria-label={`One fewer ${size}`} onClick={() => setSize(size, count - 1)}>
                                      −
                                    </button>
                                    <button type="button" className={s.stepper} aria-label={`One more ${size}`} onClick={() => setSize(size, count + 1)}>
                                      +
                                    </button>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {!sizesUnknown ? (
                          <p className={s.totalRow}>
                            <span>Total · minimum {data.moq}</span>
                            <b>{sizeTotal} pieces</b>
                          </p>
                        ) : null}
                        <label className={s.toggle} htmlFor="sizes-unknown">
                          <input
                            id="sizes-unknown"
                            type="checkbox"
                            checked={sizesUnknown}
                            onChange={(event) => {
                              setSizesUnknown(event.target.checked);
                              queue({ sizesUnknown: event.target.checked, step: "quantity" });
                            }}
                          />
                          <span className={s.toggleCopy}>
                            <span className={s.tileTitle}>I don&apos;t know the sizes yet</span>
                            <span className={s.tileMeta}>That&apos;s fine. Give us a rough quantity and add sizes later.</span>
                          </span>
                          <span className={s.toggleState} aria-hidden="true">
                            {sizesUnknown ? "✓ ON" : "OFF"}
                          </span>
                        </label>
                        {sizesUnknown ? (
                          <>
                            <FormField label="Total quantity" id="garment-total">
                              <TextField
                                inputMode="numeric"
                                value={total}
                                onChange={(event) => {
                                  const text = event.target.value.replace(/\D/g, "").slice(0, 6);
                                  setTotal(text);
                                  if (text) queue({ quantity: Number(text), step: "quantity" }, 700);
                                }}
                              />
                            </FormField>
                            <div className={s.info}>
                              <span>
                                <Users size={18} aria-hidden="true" /> <b>Ordering for a team?</b> Soon you&apos;ll be able to send one link so everyone adds their own size. It&apos;s optional.
                              </span>
                            </div>
                          </>
                        ) : null}
                        <details className={s.more}>
                          <summary className={s.textButton}>Names, numbers or departments on each item</summary>
                          <p className={s.hint}>
                            Same artwork on every item. To add a name, number or department per item, upload a spreadsheet (CSV) with a first row of: name, number, department, size.
                          </p>
                          {canUpload ? (
                            <FileUpload purpose="CSV_IMPORT" label="Drop your CSV or browse files" hint="CSV, up to 5 MB and 5,000 rows" accept=".csv,text/csv" onChange={(file) => void importCsv(file)} />
                          ) : (
                            <p className={s.hint}>Sign in, or save this design with your email, to upload files.</p>
                          )}
                          {csv && !csv.accepted ? (
                            <>
                              <Notice tone="error" title={`${csv.errors.length} ${csv.errors.length === 1 ? "problem" : "problems"} in ${csv.count} rows`} live>
                                <p>Nothing was saved. Fix these rows and upload the file again.</p>
                              </Notice>
                              <ul className={s.reasons}>
                                {csv.errors.map((error) => (
                                  <li key={`${error.row}-${error.field}`}>
                                    Row {error.row}: {error.message}
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                          {garment?.personalization.count ? (
                            <p className={s.hint}>
                              {garment.personalization.count} personalised items saved
                              {garment.personalization.preview[0] ? `, starting with ${[garment.personalization.preview[0].name, garment.personalization.preview[0].number].filter(Boolean).join(" ")}` : ""}.
                            </p>
                          ) : null}
                        </details>
                      </>,
                    )
                  : null}

                {index === 4
                  ? stepBody(
                      4,
                      <>
                        <fieldset className={s.group}>
                          <legend className="hp-visually-hidden">Artwork</legend>
                          <div className={s.tiles}>
                            {ARTWORK.filter((option) => option.value !== "LATER" || artworkLaterAllowed).map((option) => (
                              <label key={option.value} className={s.tile} htmlFor={`artwork-${option.value}`}>
                                <input
                                  id={`artwork-${option.value}`}
                                  type="radio"
                                  name="artwork"
                                  checked={artwork === option.value}
                                  onChange={() => {
                                    setArtwork(option.value);
                                    queue({ artwork: option.value, step: "artwork" });
                                  }}
                                />
                                <span className={s.tileTitle}>{option.title}</span>
                                <span className={s.tileMeta}>{option.meta}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        {!artworkLaterAllowed ? <p className={s.hint}>We need artwork before we can make this product.</p> : null}
                        {artwork && ROLE_FOR[artwork] ? (
                          canUpload ? (
                            <FileUpload key={uploadKey} purpose="ARTWORK" onChange={(file) => void attach(file)} />
                          ) : (
                            <div className={s.dropZone}>
                              <CloudUpload size={22} aria-hidden="true" />
                              <p className={s.hint}>To upload files, sign in or save this design with your email.</p>
                              <button type="button" className={s.textButton} onClick={() => setEmailOpen(true)}>
                                Save with my email
                              </button>
                            </div>
                          )
                        ) : null}
                        {draft?.files.map((file) => (
                          <div key={file.id} className={s.placement}>
                            <div className={s.placementHead}>
                              <span>
                                {file.name} · {file.role.toLowerCase().replace("_", " ")} · {file.status.toLowerCase().replace("_", " ")}
                              </span>
                              <button type="button" className={s.textButton} onClick={() => void removeFile(file.id)}>
                                Remove<span className="hp-visually-hidden"> {file.name}</span>
                              </button>
                            </div>
                            {file.lowResolution ? (
                              <>
                                <p className={s.hint}>{file.lowResolution.message}</p>
                                <div className={s.chips} role="radiogroup" aria-label={`What to do about ${file.name}`}>
                                  {(
                                    [
                                      ["REPLACE", "I'll replace it"],
                                      ["CLEANUP", "Clean it up for me"],
                                      ["REVIEW", "Review it as it is"],
                                    ] as const
                                  ).map(([action, label]) => (
                                    <label key={action} className={s.chip} htmlFor={`lowres-${file.id}-${action}`}>
                                      <input id={`lowres-${file.id}-${action}`} type="radio" name={`lowres-${file.id}`} checked={file.lowResolutionAction === action} onChange={() => void lowResAction(file.id, action)} />
                                      {label}
                                    </label>
                                  ))}
                                </div>
                              </>
                            ) : null}
                          </div>
                        ))}
                      </>,
                    )
                  : null}

                {index === 5
                  ? stepBody(
                      5,
                      <>
                        <p className={s.subhead}>When and where</p>
                        <DeliveryFields
                          draft={draft}
                          details={delivery}
                          rush={rush}
                          onChange={(change) => {
                            setDelivery((current) => ({ ...current, ...change }));
                            queue({ details: change, step: "delivery" }, 700);
                          }}
                          onRush={(value) => {
                            setRush(value);
                            queue({ rush: value, step: "delivery" });
                          }}
                        />
                        <p className={s.hint}>Delivery cost and pickup, to one address or split across branches, are confirmed with your quote.</p>
                        <p className={s.subhead}>Your choices</p>
                        <dl className={s.specs}>
                          {(
                            [
                              ["Garment", sourcing ? `${SOURCING[sourcing].title}${goneMessage("sourcing") ? " · no longer available, choose another" : ""}` : "Not chosen", 0],
                              ...data.options.map((option) => [option.label, option.values.find((value) => value.key === choices[option.key])?.label ?? "Not chosen", 0] as const),
                              ["Decoration", decoration ? `${DECORATION[decoration].title}${goneMessage("decoration") ? " · no longer available, choose another" : ""}` : "Not chosen", 1],
                              ["Placement", placeSummary || "Not chosen", 2],
                              ["Quantity", sizesUnknown ? `${total || 0} (sizes later)` : `${sizeTotal} (${Object.entries(sizes).filter(([, value]) => value).map(([size, value]) => `${size} ${value}`).join(", ") || "no sizes"})`, 3],
                              ["Artwork", ARTWORK.find((item) => item.value === artwork)?.title ?? "Not chosen", 4],
                            ] as const
                          ).map(([label, value, step]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>
                                {value}{" "}
                                <button
                                  type="button"
                                  className={s.textButton}
                                  onClick={() => {
                                    setOpen((current) => (current.includes(step) ? current : [...current, step]));
                                    requestAnimationFrame(() => stepRefs.current[step]?.scrollIntoView({ behavior: "smooth", block: "start" }));
                                  }}
                                >
                                  Edit<span className="hp-visually-hidden"> {label.toLowerCase()}</span>
                                </button>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </>,
                    )
                  : null}
              </li>
            ))}
          </ol>

          {quoteReasons.length ? (
            <div className={s.quoteNotice} role="status">
              <CircleAlert size={20} aria-hidden="true" />
              <span>
                <b>{quoteReasons.map((reason) => reason.message).join(" ")}</b> <b>All your choices are kept.</b> Send it to us and we&apos;ll price it by hand.
              </span>
            </div>
          ) : null}

          <section className={s.ticket} id="price-ticket" ref={ticket} aria-label="Your estimate" aria-live="polite" data-no-reveal>
            <div className={s.ticketTop}>
              <div className={s.ticketAmount}>
                <span className={s.ticketCaption}>{caption}</span>
                <span className={s.ticketTotal}>{price?.totalMinor ? naira(price.totalMinor) : priceState === "QUOTE_REQUIRED" && price ? "We'll quote this" : pieces && pieces < data.moq ? `Minimum ${data.moq}` : "—"}</span>
                <span className={s.ticketPer}>
                  {price?.perUnitMinor
                    ? `≈ ${naira(price.perUnitMinor)} per piece${placements.length ? ` · ${placements.length} position${placements.length === 1 ? "" : "s"}` : ""}`
                    : pieces && pieces < data.moq
                      ? `Add ${data.moq - pieces} more to see an estimate`
                      : "Add sizes or a quantity to see an estimate"}
                </span>
              </div>
              <div className={s.ticketTiming}>
                <span>Production · {data.leadDays ? `${data.leadDays.min}–${data.leadDays.max} working days` : "confirmed with your quote"}</span>
                <span>Delivery · confirmed with your quote</span>
              </div>
            </div>
            {ticketReasons.length ? (
              <ul className={`${s.reasons} ${s.lines}`}>
                {ticketReasons.map((reason) => (
                  <li key={reason.code + reason.message} className={reason.blocking ? s.blocking : undefined}>
                    {reason.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={s.perf} aria-hidden="true" />
            <div className={s.ticketBody}>
              {notice ? (
                <Notice tone="info" title="Heads up" live>
                  <p>{notice}</p>
                </Notice>
              ) : null}
              <QuoteRequest
                draft={draft}
                ensure={ensure}
                buttonClassName={s.brandButton}
                onRequested={() => void (draftRef.current ? api(`/v1/configurations/${draftRef.current.id}`, { response: configurationSchema }).then(apply) : null)}
              >
                <ArrowRight size={18} aria-hidden="true" />
              </QuoteRequest>
              {/* Quote it together with other items from the cart (Pen 41 "Needs a quote"). */}
              {draft?.quote ? null : (
                <AddToCart draft={draft} ensure={ensure} className={s.secondary} label="Add to cart for a quote" disabled={!draft?.price || Boolean(draft.garment?.unavailable.length)} />
              )}
              <div className={s.links}>
                <button type="button" className={s.textButton} onClick={() => setEmailOpen(true)}>
                  {draft?.emailedTo ? `Link sent to ${draft.emailedTo}` : "Save for later"}
                </button>
                {saveState === "failed" ? (
                  <button type="button" className={s.textButton} onClick={() => void flush()}>
                    Retry now
                  </button>
                ) : null}
                <a className={s.textButton} href={`/contact?topic=product&product=${productSlug}`}>
                  Ask Holypearls about this setup
                </a>
              </div>
              <p className={s.small}>
                {priceState === "PRICE_READY" ? "The price is confirmed with your order." : "This is an estimate. The final amount is confirmed after a production review."} No payment is taken now.
              </p>
            </div>
          </section>
        </div>
      </section>

      <div className={`${s.stickyBar} ${stickyVisible ? s.stickyOn : ""}`} aria-label={`${productName} price`} aria-hidden={!stickyVisible}>
        <span className={s.stickyPrice}>
          <span className={s.stickyCaption}>
            {pieces ? `${pieces} pieces · ` : ""}
            {priceState === "QUOTE_REQUIRED" ? "quote" : "estimate"}
          </span>
          <strong className={s.stickyTotal}>{price?.totalMinor ? naira(price.totalMinor) : "—"}</strong>
          {price?.perUnitMinor ? <span className={s.stickyPer}>≈ {naira(price.perUnitMinor)} each</span> : null}
        </span>
        <a className={`${s.brandButton} ${s.stickyCta}`} href="#price-ticket" tabIndex={stickyVisible ? 0 : -1}>
          Request Final Quote
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
        <ul>
          {conflicts?.list.map((item) => (
            <li key={item.option}>{item.message}</li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Save this design with your email"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmailOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void sendEmail()}>Send link</Button>
          </>
        }
      >
        <FormField label="Email" id="garment-email" error={emailError} hint="We email a private link to this design. You can then upload files here.">
          <TextField type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
      </Dialog>
    </>
  );
}

