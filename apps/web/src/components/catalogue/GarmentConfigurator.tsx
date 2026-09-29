"use client";

import {
  type Configuration,
  type ConfigurationDetails,
  configurationSchema,
  type Configurator as ConfiguratorData,
  DECORATION_LABEL,
  GARMENT_SIZES,
  type PlacementInput,
  personalizationResultSchema,
  SOURCING_LABEL,
  type FileView,
} from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextArea, TextField } from "@holypearls/ui";
import { ArrowLeft, ArrowRight, CircleCheck, CircleDashed, CloudUpload, Info, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { FileUpload } from "../FileUpload";
import styles from "./configurator.module.css";
import w from "./wizard.module.css";
import { DeliveryFields, QuoteRequest } from "./FamilyDelivery";
import { GarmentPreview, POSITION_LABEL, type Position } from "./GarmentPreview";
import { useDraft } from "./useDraft";

type Sourcing = NonNullable<NonNullable<Configuration["garment"]>["sourcing"]>;
type Decoration = NonNullable<NonNullable<Configuration["garment"]>["decoration"]>;
type Artwork = NonNullable<Configuration["artwork"]>;

/*
 * Copy only. Which choices a product offers comes from the API
 * (configurator.allowedRoutes, allowedDecorations), which also refuses others.
 */
const SOURCING: Record<Sourcing, { title: string; meta: string }> = {
  SOURCE_CUSTOMIZE: { title: SOURCING_LABEL.SOURCE_CUSTOMIZE, meta: "We supply the garment and add your branding" },
  MAKE_FROM_SCRATCH: { title: SOURCING_LABEL.MAKE_FROM_SCRATCH, meta: "Cut and sewn to your fabric, fit and colour" },
  CUSTOMER_SUPPLIED: { title: SOURCING_LABEL.CUSTOMER_SUPPLIED, meta: "You send garments; we brand them" },
  HELP_ME_CHOOSE: { title: SOURCING_LABEL.HELP_ME_CHOOSE, meta: "Tell us what it's for; we recommend" },
};

const DECORATION: Record<Decoration, { title: string; meta: string }> = {
  EMBROIDERY: { title: DECORATION_LABEL.EMBROIDERY, meta: "Raised, textured, premium" },
  PRINT: { title: DECORATION_LABEL.PRINT, meta: "Bold graphics, bigger areas" },
  BOTH: { title: DECORATION_LABEL.BOTH, meta: "Embroidered logo, printed back" },
  RECOMMEND: { title: DECORATION_LABEL.RECOMMEND, meta: "We'll suggest after seeing your logo" },
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
  { value: "UPLOAD", title: "Upload ready artwork", meta: "Print-ready PDF or AI works best" },
  { value: "LOGO", title: "Upload my logo", meta: "We place it for you" },
  { value: "REFERENCE", title: "Upload a reference", meta: "A photo or sketch of what you want" },
  { value: "DESIGN_HELP", title: "Need design help", meta: "We'll contact you with options" },
  { value: "LATER", title: "I'll send it later", meta: "Held for artwork" },
];

const ROLE_FOR: Record<string, "ARTWORK" | "LOGO" | "REFERENCE"> = { UPLOAD: "ARTWORK", LOGO: "LOGO", REFERENCE: "REFERENCE" };
const STEPS = ["Product", "Customize", "Quantity", "Artwork", "Delivery", "Review"] as const;
const STEP_KEYS = ["product", "customize", "quantity", "artwork", "delivery", "review"] as const;
/** The question each step asks (Pen 22: "Place your logo."). */
const STEP_TITLES = ["How should we make it?", "Place your logo.", "How many, in which sizes?", "Add your artwork.", "When and where?", "Check your design."] as const;

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
  initialDraft: Configuration | null;
  signedIn: boolean;
  /** Chosen on the product page (Pen 19) before "Configure yours". */
  startSourcing?: Sourcing | null;
  startChoices?: Record<string, string>;
  /** Front photos by colour key, shown behind the placement map (Pen 22). */
  photos?: Record<string, string>;
}

/**
 * Garment configurator (Pen 22 · O2tORo; COM-FR-020–029, 050–054): how the
 * garment is sourced, decoration and placements on a garment map, sizes and
 * personalization, and artwork with resolution warnings that never block.
 * Six steady steps; every change autosaves to the draft.
 */
export function GarmentConfigurator({ productSlug, productName, data, initialDraft, signedIn, startSourcing = null, startChoices = {}, photos = {} }: Props) {
  const defaults = { ...Object.fromEntries(data.options.map((option) => [option.key, (option.values.find((value) => value.isDefault) ?? option.values[0])?.key ?? ""])), ...startChoices };
  const { draft, apply, saveState, notice, setNotice, conflicts, resolveConflicts, queue, flush, ensure, draftRef } = useDraft(productSlug, initialDraft, defaults);
  const garment = draft?.garment ?? null;

  const [choices, setChoices] = useState<Record<string, string>>(initialDraft?.choices ?? defaults);
  const [sourcing, setSourcing] = useState<Sourcing | null>(garment?.sourcing ?? startSourcing);
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
  const draftStep = STEP_KEYS.indexOf((initialDraft?.step ?? "") as (typeof STEP_KEYS)[number]);
  const [current, setCurrent] = useState(draftStep >= 0 ? draftStep : startSourcing ? 1 : 0);

  // A route chosen on the product page is saved as soon as the configurator opens.
  useEffect(() => {
    if (!initialDraft && startSourcing) queue({ sourcing: startSourcing, step: "customize" }, 0);
  }, []);

  const go = (index: number) => {
    setCurrent(index);
    queue({ step: STEP_KEYS[index] }, 0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const price = draft?.price ?? null;
  const serverConflicts = garment?.conflicts ?? [];
  const canUpload = signedIn || Boolean(draft?.emailedTo);
  const artworkLaterAllowed = draft?.artworkLaterAllowed ?? true;
  const save =
    saveState === "failed"
      ? { tone: w.failed, icon: <RefreshCw size={16} aria-hidden="true" />, text: "Not saved — retrying" }
      : saveState === "saving"
        ? { tone: w.pending, icon: <CloudUpload size={16} aria-hidden="true" />, text: "Saving…" }
        : saveState === "saved" && draft
          ? { tone: "", icon: <CircleCheck size={16} aria-hidden="true" />, text: "Draft saved" }
          : { tone: w.pending, icon: <CircleDashed size={16} aria-hidden="true" />, text: "Not saved yet" };
  const unavailable = garment?.unavailable ?? [];
  const goneMessage = (field: string) => unavailable.find((item) => item.field === field)?.message;
  const placementMethods = (["EMBROIDERY", "PRINT"] as const).filter((method) => data.allowedDecorations.includes(method));

  const setDetail = (key: string, value: string | boolean) => {
    setDetails({ ...details, [key]: value });
    queue({ details: { [key]: value }, step: "product" }, 800);
  };

  const togglePlacement = (position: Position) => {
    const exists = placements.some((placement) => placement.position === position);
    const next = exists ? placements.filter((placement) => placement.position !== position) : [...placements, { position, size: "STANDARD" as const, method: null, note: null }];
    setPlacements(next);
    queue({ placements: next, step: "customize" });
  };

  const updatePlacement = (position: Position, change: Partial<PlacementInput>) => {
    const next = placements.map((placement) => (placement.position === position ? { ...placement, ...change } : placement));
    setPlacements(next);
    queue({ placements: next, step: "customize" }, change.note !== undefined ? 800 : 400);
  };

  /** Applies one conflict fix; other placements stay as they are (COM-FR-026). */
  const fix = (position: Position, change: Record<string, unknown>) => {
    if (change.remove) togglePlacement(position);
    else updatePlacement(position, change as Partial<PlacementInput>);
  };

  const setSize = (size: string, value: string) => {
    const quantity = Number(value.replace(/\D/g, "").slice(0, 6) || 0);
    const next = { ...sizes, [size]: quantity };
    setSizes(next);
    queue({ sizes: GARMENT_SIZES.map((item) => ({ size: item, quantity: next[item] ?? 0 })), step: "quantity" }, 700);
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
  const conflictFor = (position: Position) => serverConflicts.some((conflict) => conflict.positions.includes(position));

  return (
    <div className={w.page}>
      <header className={w.header}>
        <div className={w.brand}>
          <a className={w.logo} href="/" aria-label="HolyPearls home">
            <span className={w.pearl} aria-hidden="true" />
            HolyPearls
          </a>
          <span className={w.crumb}>/ {productName}</span>
        </div>
        <nav aria-label="Steps">
          <ol className={w.stepper}>
            {STEPS.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className={`${w.stepButton} ${index === current ? w.stepCurrent : index < current ? w.stepDone : ""}`}
                  aria-current={index === current ? "step" : undefined}
                  onClick={() => go(index)}
                >
                  <span className={w.stepNum} aria-hidden="true">
                    {index < current ? <CircleCheck size={14} /> : index + 1}
                  </span>
                  <span className={w.stepLabel}>{label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className={w.right}>
          {/* One live region whose text changes; success styling only once the draft is really saved. */}
          <span className={`${w.saved} ${save.tone}`} role="status">
            {save.icon}
            <span className={w.savedText}>{save.text}</span>
          </span>
          <a className={w.exit} href={`/products/${productSlug}`} onClick={() => void flush()}>
            Save &amp; exit
          </a>
        </div>
      </header>

      <main id="main-content" className={w.body}>
        <aside className={w.previewColumn} aria-label="Preview">
          <div className={w.stage}>
            <div className={w.viewToggle} role="group" aria-label="Garment side">
              {(["front", "back"] as const).map((side) => (
                <button key={side} type="button" className={w.viewButton} aria-pressed={view === side} onClick={() => setView(side)}>
                  {side === "front" ? "Front" : "Back"}
                </button>
              ))}
            </div>
            <GarmentPreview
              view={view}
              placements={placements}
              conflicts={serverConflicts}
              onToggle={togglePlacement}
              fill={data.options.find((option) => option.key === "colour")?.values.find((value) => value.key === choices.colour)?.swatch}
              photo={choices.colour ? photos[choices.colour] : null}
            />
            <span className={w.tag}>
              {placements.length ? `${placements.map((placement) => POSITION_LABEL[placement.position]).join(" · ").toUpperCase()} · SIZE IN PROOF` : "CHOOSE WHERE YOUR DESIGN GOES"}
            </span>
          </div>
          <p className={w.previewFoot}>
            <Info size={16} aria-hidden="true" />
            Preview only, not to scale. You&apos;ll approve the final design in a proof before we produce.
          </p>
        </aside>

        <div className={w.column}>
          <div>
            <p className={w.eyebrow}>
              Step {current + 1} of {STEPS.length} · {STEPS[current]}
              {current === 1 && decoration ? ` · ${DECORATION[decoration].title}` : ""}
            </p>
            <h1 className={w.title}>{STEP_TITLES[current]}</h1>
          </div>
          {/* 01 Product */}
          <fieldset className={styles.step} id="step-product" hidden={current !== 0}>
            <legend className="hp-visually-hidden">
              {STEPS[0]}
            </legend>
            {goneMessage("sourcing") ? (
              <Notice tone="warning" title="Choose another way to make it" live>
                <p>{goneMessage("sourcing")}</p>
              </Notice>
            ) : null}
            <div className={styles.choices}>
              {visibleChoices(data.allowedRoutes, garment?.sourcing ?? null).map(({ value, gone }) => (
                <label key={value} className={styles.choice} htmlFor={`sourcing-${value}`}>
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
                  <span className={styles.choiceTitle}>{SOURCING[value].title}</span>
                  <span className={styles.choiceMeta}>{gone ? "No longer available for this product" : SOURCING[value].meta}</span>
                </label>
              ))}
            </div>
            {sourcing === "SOURCE_CUSTOMIZE" || sourcing === null
              ? data.options.map((option) => (
                  <fieldset key={option.key} className={styles.step}>
                    <legend className={styles.stepExtra}>{option.label}</legend>
                    <div className={styles.segmented}>
                      {option.values.map((value) => (
                        <label key={value.key} htmlFor={`choice-${option.key}-${value.key}`}>
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
                ))
              : null}
            {sourcing === "MAKE_FROM_SCRATCH" ? (
              <>
                <FormField label="What should we make? (reference)" id="detail-reference" hint="Describe it, or add a reference picture in Artwork.">
                  <TextArea value={(details.reference as string) ?? ""} onChange={(event) => setDetail("reference", event.target.value)} />
                </FormField>
                <div className={styles.choices}>
                  {(["fit", "fabric", "colour", "labels"] as const).map((key) => (
                    <FormField key={key} label={{ fit: "Fit", fabric: "Fabric", colour: "Colour", labels: "Labels" }[key]} id={`detail-${key}`}>
                      <TextField value={(details[key] as string) ?? ""} onChange={(event) => setDetail(key, event.target.value)} />
                    </FormField>
                  ))}
                </div>
                <label className={styles.choice} htmlFor="detail-sample">
                  <input id="detail-sample" type="checkbox" checked={Boolean(details.sampleFirst)} onChange={(event) => setDetail("sampleFirst", event.target.checked)} />
                  <span className={styles.choiceTitle}>Make a sample first</span>
                  <span className={styles.choiceMeta}>Approve one piece before the full run</span>
                </label>
              </>
            ) : null}
            {sourcing === "CUSTOMER_SUPPLIED" ? (
              <>
                <FormField label="What are you sending?" id="detail-supplied" hint="Type, colours, how many. Add photos in Artwork.">
                  <TextArea value={(details.suppliedItems as string) ?? ""} onChange={(event) => setDetail("suppliedItems", event.target.value)} />
                </FormField>
                <fieldset className={styles.step}>
                  <legend className={styles.stepExtra}>How we receive them</legend>
                  <div className={styles.segmented}>
                    {(
                      [
                        ["DROP_OFF", "I'll drop them off"],
                        ["PICKUP", "Pick them up"],
                        ["COURIER", "I'll send by courier"],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value} htmlFor={`receive-${value}`}>
                        <input id={`receive-${value}`} type="radio" name="receive" checked={details.receiveMethod === value} onChange={() => setDetail("receiveMethod", value)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className={styles.placeholder}>The price is final after we inspect your garments.</p>
              </>
            ) : null}
            {sourcing === "HELP_ME_CHOOSE" ? (
              <FormField label="What is it for?" id="detail-purpose" hint="For example: 30 front-of-house staff, hot kitchen, smart look.">
                <TextArea value={(details.reference as string) ?? ""} onChange={(event) => setDetail("reference", event.target.value)} />
              </FormField>
            ) : null}
          </fieldset>

          {/* 02 Customize */}
          <fieldset className={styles.step} id="step-customize" hidden={current !== 1}>
            <legend className="hp-visually-hidden">
              {STEPS[1]}
            </legend>
            {goneMessage("decoration") ? (
              <Notice tone="warning" title="Choose another decoration" live>
                <p>{goneMessage("decoration")}</p>
              </Notice>
            ) : null}
            <div className={styles.choices}>
              {visibleChoices(data.allowedDecorations, garment?.decoration ?? null).map(({ value, gone }) => (
                <label key={value} className={styles.choice} htmlFor={`decoration-${value}`}>
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
                  <span className={styles.choiceTitle}>{DECORATION[value].title}</span>
                  <span className={styles.choiceMeta}>{gone ? "No longer available for this product" : DECORATION[value].meta}</span>
                </label>
              ))}
            </div>
            <fieldset className={styles.step}>
              <legend className={styles.stepExtra}>Placement (tap the garment, or choose here)</legend>
              <div className={styles.segmented}>
                {(Object.keys(POSITION_LABEL) as Position[]).map((position) => (
                  <label key={position} htmlFor={`placement-${position}`}>
                    <input
                      id={`placement-${position}`}
                      type="checkbox"
                      checked={placements.some((placement) => placement.position === position)}
                      onChange={() => togglePlacement(position)}
                    />
                    {POSITION_LABEL[position]}
                  </label>
                ))}
              </div>
            </fieldset>
            {serverConflicts.map((conflict) => (
              <div key={conflict.message} className={styles.conflict} role="alert">
                <strong>{conflict.message}</strong>
                <div className={styles.segmented}>
                  {conflict.fixes.map((item) => (
                    <Button key={item.label} variant="secondary" onClick={() => fix(item.position, item.change)}>
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {placements.map((placement) => (
              <div key={placement.position} className={styles.placementRow}>
                <div className={styles.placementHead}>
                  <span>
                    {POSITION_LABEL[placement.position]}
                    {conflictFor(placement.position) ? " · needs a fix" : ""}
                  </span>
                  <Button variant="tertiary" onClick={() => togglePlacement(placement.position)}>
                    Remove
                  </Button>
                </div>
                <div className={styles.segmented} role="radiogroup" aria-label={`${POSITION_LABEL[placement.position]} size`}>
                  {(["SMALL", "STANDARD", "LARGE"] as const).map((size) => (
                    <label key={size} htmlFor={`size-${placement.position}-${size}`}>
                      <input id={`size-${placement.position}-${size}`} type="radio" name={`size-${placement.position}`} checked={placement.size === size} onChange={() => updatePlacement(placement.position, { size })} />
                      {size === "SMALL" ? "Small" : size === "STANDARD" ? "Standard" : "Large"}
                    </label>
                  ))}
                </div>
                {goneMessage(`placements.${placement.position}`) ? <p className={styles.stepExtra}>{goneMessage(`placements.${placement.position}`)}</p> : null}
                {decoration === "BOTH" || goneMessage(`placements.${placement.position}`) ? (
                  <div className={styles.segmented} role="radiogroup" aria-label={`${POSITION_LABEL[placement.position]} method`}>
                    {placementMethods.map((method) => (
                      <label key={method} htmlFor={`method-${placement.position}-${method}`}>
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
          </fieldset>

          {/* 03 Quantity */}
          <fieldset className={styles.step} id="step-quantity" hidden={current !== 2}>
            <legend className="hp-visually-hidden">
              {STEPS[2]}
            </legend>
            <p className={styles.stepExtra}>Minimum {data.moq}. Enter how many of each size.</p>
            <label className={styles.choice} htmlFor="sizes-unknown">
              <input
                id="sizes-unknown"
                type="checkbox"
                checked={sizesUnknown}
                onChange={(event) => {
                  setSizesUnknown(event.target.checked);
                  queue({ sizesUnknown: event.target.checked, step: "quantity" });
                }}
              />
              <span className={styles.choiceTitle}>I don&apos;t know the sizes yet</span>
              <span className={styles.choiceMeta}>Give a total now and add sizes later</span>
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
                <p className={styles.placeholder}>
                  Ordering for a team? Soon you&apos;ll be able to send your staff a link to enter their own sizes (Group Collection).
                </p>
              </>
            ) : (
              <div className={styles.sizeGrid}>
                {GARMENT_SIZES.map((size) => (
                  <label key={size} htmlFor={`size-${size}`}>
                    {size}
                    <input id={`size-${size}`} inputMode="numeric" value={sizes[size] ? String(sizes[size]) : ""} onChange={(event) => setSize(size, event.target.value)} placeholder="0" />
                  </label>
                ))}
              </div>
            )}
            {!sizesUnknown && sizeTotal ? <p className={styles.stepExtra}>Total: {sizeTotal}</p> : null}
            <details>
              <summary className={styles.stepExtra}>Names, numbers or departments on each item</summary>
              <p className={styles.placeholder}>
                Same artwork on every item. To add a name, number or department per item, upload a spreadsheet (CSV) with a first row of: name, number, department,
                size.
              </p>
              {canUpload ? (
                <FileUpload purpose="CSV_IMPORT" label="Drop your CSV or browse files" hint="CSV, up to 5 MB and 5,000 rows" accept=".csv,text/csv" onChange={(file) => void importCsv(file)} />
              ) : (
                <p className={styles.placeholder}>Sign in, or save this design with your email, to upload files.</p>
              )}
              {csv && !csv.accepted ? (
                <>
                  <Notice tone="error" title={`${csv.errors.length} ${csv.errors.length === 1 ? "problem" : "problems"} in ${csv.count} rows`} live>
                    <p>Nothing was saved. Fix these rows and upload the file again.</p>
                  </Notice>
                  <ul className={styles.errorList}>
                    {csv.errors.map((error) => (
                      <li key={`${error.row}-${error.field}`}>
                        Row {error.row}: {error.message}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {garment?.personalization.count ? (
                <p className={styles.stepExtra}>
                  {garment.personalization.count} personalised items saved
                  {garment.personalization.preview[0] ? `, starting with ${[garment.personalization.preview[0].name, garment.personalization.preview[0].number].filter(Boolean).join(" ")}` : ""}.
                </p>
              ) : null}
            </details>
          </fieldset>

          {/* 04 Artwork */}
          <fieldset className={styles.step} id="step-artwork" hidden={current !== 3}>
            <legend className="hp-visually-hidden">
              {STEPS[3]}
            </legend>
            <div className={styles.choices}>
              {ARTWORK.filter((option) => option.value !== "LATER" || artworkLaterAllowed).map((option) => (
                <label key={option.value} className={styles.choice} htmlFor={`artwork-${option.value}`}>
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
                  <span className={styles.choiceTitle}>{option.title}</span>
                  <span className={styles.choiceMeta}>{option.meta}</span>
                </label>
              ))}
            </div>
            {!artworkLaterAllowed ? <p className={styles.stepExtra}>We need artwork before we can make this product.</p> : null}
            {artwork && ROLE_FOR[artwork] ? (
              canUpload ? (
                <FileUpload key={uploadKey} purpose="ARTWORK" onChange={(file) => void attach(file)} />
              ) : (
                <div className={styles.placeholder}>
                  <p>To upload files, sign in or save this design with your email.</p>
                  <Button variant="secondary" onClick={() => setEmailOpen(true)}>
                    Save with my email
                  </Button>
                </div>
              )
            ) : null}
            {draft?.files.map((file) => (
              <div key={file.id} className={styles.fileRow}>
                <div className={styles.placementHead}>
                  <span>
                    {file.name} · {file.role.toLowerCase().replace("_", " ")} · {file.status.toLowerCase().replace("_", " ")}
                  </span>
                  <Button variant="tertiary" onClick={() => void removeFile(file.id)}>
                    Remove
                  </Button>
                </div>
                {file.lowResolution ? (
                  <div className={styles.lowRes}>
                    <p>{file.lowResolution.message}</p>
                    <div className={styles.segmented} role="radiogroup" aria-label={`What to do about ${file.name}`}>
                      {(
                        [
                          ["REPLACE", "I'll replace it"],
                          ["CLEANUP", "Clean it up for me"],
                          ["REVIEW", "Review it as it is"],
                        ] as const
                      ).map(([action, label]) => (
                        <label key={action} htmlFor={`lowres-${file.id}-${action}`}>
                          <input id={`lowres-${file.id}-${action}`} type="radio" name={`lowres-${file.id}`} checked={file.lowResolutionAction === action} onChange={() => void lowResAction(file.id, action)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </fieldset>

          {/* 05 Delivery */}
          <section className={styles.step} id="step-delivery" aria-labelledby="garment-delivery" hidden={current !== 4}>
            <h2 id="garment-delivery" className="hp-visually-hidden">
              {STEPS[4]}
            </h2>
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
            <p className={styles.stepExtra}>Delivery cost and pickup, to one address or split across branches, are confirmed at checkout.</p>
          </section>

          {/* 06 Review */}
          <section className={styles.step} id="step-review" aria-labelledby="garment-review" hidden={current !== 5}>
            <h2 id="garment-review" className="hp-visually-hidden">
              {STEPS[5]}
            </h2>
            <dl className={styles.review}>
              {(
                [
                  ["Garment", sourcing ? `${SOURCING[sourcing].title}${goneMessage("sourcing") ? " · no longer available, choose another" : ""}` : "Not chosen", "step-product"],
                  ...data.options.map((option) => [option.label, option.values.find((value) => value.key === choices[option.key])?.label ?? "Not chosen", "step-product"] as const),
                  ["Decoration", decoration ? `${DECORATION[decoration].title}${goneMessage("decoration") ? " · no longer available, choose another" : ""}` : "Not chosen", "step-customize"],
                  ["Placement", placements.map((placement) => POSITION_LABEL[placement.position]).join(", ") || "Not chosen", "step-customize"],
                  ["Quantity", sizesUnknown ? `${total || 0} (sizes later)` : `${sizeTotal} (${Object.entries(sizes).filter(([, value]) => value).map(([size, value]) => `${size} ${value}`).join(", ") || "no sizes"})`, "step-quantity"],
                  ["Artwork", ARTWORK.find((item) => item.value === artwork)?.title ?? "Not chosen", "step-artwork"],
                ] as const
              ).map(([label, value, anchor]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value}{" "}
                    <button type="button" className={styles.linkButton} onClick={() => go(STEP_KEYS.indexOf(anchor.replace("step-", "") as (typeof STEP_KEYS)[number]))}>
                      Edit<span className="hp-visually-hidden"> {label.toLowerCase()}</span>
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <div className={w.live} aria-live="polite">
            <div className={w.liveHead}>
              <p className={w.liveLabel}>
                {price?.state === "ESTIMATE_READY" ? "ESTIMATED · " : ""}
                {price?.quantity ? `${price.quantity} ${productName.toUpperCase()}` : productName.toUpperCase()}
                {placements.length ? ` · ${placements.map((placement) => POSITION_LABEL[placement.position]).join(", ").toUpperCase()}` : ""}
              </p>
              {price && saveState === "saved" ? (
                <span className={w.updated}>
                  <RefreshCw size={14} aria-hidden="true" />
                  Estimate updated
                </span>
              ) : null}
            </div>
            <div className={w.liveRow}>
              <p className={w.liveValue}>{price?.totalMinor ? naira(price.totalMinor) : "—"}</p>
              <p className={w.liveNote}>
                {price?.perUnitMinor ? `≈ ${naira(price.perUnitMinor)} / piece · final amount confirmed after production review` : "Add sizes or a quantity to see an estimate"}
              </p>
            </div>
            {price?.reasons.length ? (
              <ul className={styles.reasons}>
                {price.reasons.map((reason) => (
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
            {current === STEPS.length - 1 ? (
              <QuoteRequest draft={draft} ensure={ensure} onRequested={() => void (draftRef.current ? api(`/v1/configurations/${draftRef.current.id}`, { response: configurationSchema }).then(apply) : null)} />
            ) : null}
            <div className={w.links}>
              {saveState === "failed" ? (
                <button type="button" className={styles.linkButton} onClick={() => void flush()}>
                  Retry now
                </button>
              ) : null}
              <button type="button" className={styles.linkButton} onClick={() => setEmailOpen(true)}>
                {draft?.emailedTo ? `Link sent to ${draft.emailedTo}` : "Email me a link to this design"}
              </button>
            </div>
          </div>
          <div className={w.nav}>
            {current > 0 ? (
              <button type="button" className={w.back} onClick={() => go(current - 1)}>
                <ArrowLeft size={18} aria-hidden="true" />
                Back
              </button>
            ) : null}
            {current < STEPS.length - 1 ? (
              <button type="button" className={w.continue} onClick={() => go(current + 1)}>
                Continue to {STEPS[current + 1]!.toLowerCase()}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </main>

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
    </div>
  );
}
