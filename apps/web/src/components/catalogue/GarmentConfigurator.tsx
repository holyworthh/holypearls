"use client";

import {
  type Configuration,
  configurationSchema,
  type Configurator as ConfiguratorData,
  GARMENT_SIZES,
  type PlacementInput,
  personalizationResultSchema,
  type FileView,
} from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextArea, TextField } from "@holypearls/ui";
import { useState } from "react";
import { api } from "../../lib/api";
import { FileUpload } from "../FileUpload";
import styles from "./configurator.module.css";
import { GarmentPreview, POSITION_LABEL, type Position } from "./GarmentPreview";
import { useDraft } from "./useDraft";

type Sourcing = NonNullable<NonNullable<Configuration["garment"]>["sourcing"]>;
type Decoration = NonNullable<NonNullable<Configuration["garment"]>["decoration"]>;
type Artwork = NonNullable<Configuration["artwork"]>;

const SOURCING: { value: Sourcing; title: string; meta: string }[] = [
  { value: "SOURCE_CUSTOMIZE", title: "Source & Customize", meta: "We supply the garment and add your branding" },
  { value: "MAKE_FROM_SCRATCH", title: "Make From Scratch", meta: "Cut and sewn to your fabric, fit and colour" },
  { value: "CUSTOMER_SUPPLIED", title: "I'll Supply the Garment", meta: "You send garments; we brand them" },
  { value: "HELP_ME_CHOOSE", title: "Help Me Choose", meta: "Tell us what it's for; we recommend" },
];

const DECORATION: { value: Decoration; title: string; meta: string }[] = [
  { value: "EMBROIDERY", title: "Embroidery", meta: "Raised, textured, premium" },
  { value: "PRINT", title: "Print", meta: "Bold graphics, bigger areas" },
  { value: "BOTH", title: "Both", meta: "Embroidered logo, printed back" },
  { value: "RECOMMEND", title: "Recommend for me", meta: "We'll suggest after seeing your logo" },
];

const ARTWORK: { value: Artwork; title: string; meta: string }[] = [
  { value: "UPLOAD", title: "Upload ready artwork", meta: "Print-ready PDF or AI works best" },
  { value: "LOGO", title: "Upload my logo", meta: "We place it for you" },
  { value: "REFERENCE", title: "Upload a reference", meta: "A photo or sketch of what you want" },
  { value: "DESIGN_HELP", title: "Need design help", meta: "We'll contact you with options" },
  { value: "LATER", title: "I'll send it later", meta: "Held for artwork" },
];

const ROLE_FOR: Record<string, "ARTWORK" | "LOGO" | "REFERENCE"> = { UPLOAD: "ARTWORK", LOGO: "LOGO", REFERENCE: "REFERENCE" };
const STEPS = ["Product", "Customize", "Quantity", "Artwork", "Delivery", "Review"] as const;

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
}

/**
 * Garment configurator (Pen 22 · O2tORo; COM-FR-020–029, 050–054): how the
 * garment is sourced, decoration and placements on a garment map, sizes and
 * personalization, and artwork with resolution warnings that never block.
 * Six steady steps; every change autosaves to the draft.
 */
export function GarmentConfigurator({ productSlug, productName, data, initialDraft, signedIn }: Props) {
  const defaults = Object.fromEntries(data.options.map((option) => [option.key, (option.values.find((value) => value.isDefault) ?? option.values[0])?.key ?? ""]));
  const { draft, apply, saveState, notice, setNotice, conflicts, resolveConflicts, queue, flush, ensure } = useDraft(productSlug, initialDraft, defaults);
  const garment = draft?.garment ?? null;

  const [choices, setChoices] = useState<Record<string, string>>(initialDraft?.choices ?? defaults);
  const [sourcing, setSourcing] = useState<Sourcing | null>(garment?.sourcing ?? null);
  const [decoration, setDecoration] = useState<Decoration | null>(garment?.decoration ?? null);
  const [details, setDetails] = useState<Record<string, string | boolean>>((garment?.details as Record<string, string | boolean>) ?? {});
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

  const price = draft?.price ?? null;
  const serverConflicts = garment?.conflicts ?? [];
  const canUpload = signedIn || Boolean(draft?.emailedTo);
  const artworkLaterAllowed = draft?.artworkLaterAllowed ?? true;

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
  const number = (index: number) => String(index + 1).padStart(2, "0");
  const conflictFor = (position: Position) => serverConflicts.some((conflict) => conflict.positions.includes(position));

  return (
    <div className="garment-configurator">
      <div className={styles.top}>
        <aside className={styles.preview} aria-label="Preview">
          <span className={styles.previewTag}>
            {placements.length ? placements.map((placement) => POSITION_LABEL[placement.position]).join(" · ").toUpperCase() : "CHOOSE WHERE YOUR DESIGN GOES"}
          </span>
          <GarmentPreview view={view} placements={placements} conflicts={serverConflicts} onToggle={togglePlacement} />
          <div className={styles.views} role="group" aria-label="Garment side">
            {(["front", "back"] as const).map((side) => (
              <Button key={side} variant={view === side ? "ink" : "secondary"} aria-pressed={view === side} onClick={() => setView(side)}>
                {side === "front" ? "Front" : "Back"}
              </Button>
            ))}
          </div>
          <p className={styles.previewNote}>Preview only, not to scale. You&apos;ll approve the final design in a proof before we produce.</p>
        </aside>

        <div className={styles.configurator}>
          {/* 01 Product */}
          <fieldset className={styles.step} id="step-product">
            <legend className={styles.stepTitle}>
              <span className={styles.stepNumber}>{number(0)}</span> {STEPS[0]}
            </legend>
            <div className={styles.choices}>
              {SOURCING.map((option) => (
                <label key={option.value} className={styles.choice} htmlFor={`sourcing-${option.value}`}>
                  <input
                    id={`sourcing-${option.value}`}
                    type="radio"
                    name="sourcing"
                    checked={sourcing === option.value}
                    onChange={() => {
                      setSourcing(option.value);
                      queue({ sourcing: option.value, step: "product" });
                    }}
                  />
                  <span className={styles.choiceTitle}>{option.title}</span>
                  <span className={styles.choiceMeta}>{option.meta}</span>
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
          <fieldset className={styles.step} id="step-customize">
            <legend className={styles.stepTitle}>
              <span className={styles.stepNumber}>{number(1)}</span> {STEPS[1]}
            </legend>
            <div className={styles.choices}>
              {DECORATION.map((option) => (
                <label key={option.value} className={styles.choice} htmlFor={`decoration-${option.value}`}>
                  <input
                    id={`decoration-${option.value}`}
                    type="radio"
                    name="decoration"
                    checked={decoration === option.value}
                    onChange={() => {
                      setDecoration(option.value);
                      queue({ decoration: option.value, step: "customize" });
                    }}
                  />
                  <span className={styles.choiceTitle}>{option.title}</span>
                  <span className={styles.choiceMeta}>{option.meta}</span>
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
                {decoration === "BOTH" ? (
                  <div className={styles.segmented} role="radiogroup" aria-label={`${POSITION_LABEL[placement.position]} method`}>
                    {(["EMBROIDERY", "PRINT"] as const).map((method) => (
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
          <fieldset className={styles.step} id="step-quantity">
            <legend className={styles.stepTitle}>
              <span className={styles.stepNumber}>{number(2)}</span> {STEPS[2]}
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
          <fieldset className={styles.step} id="step-artwork">
            <legend className={styles.stepTitle}>
              <span className={styles.stepNumber}>{number(3)}</span> {STEPS[3]}
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
          <section className={styles.step} id="step-delivery" aria-labelledby="garment-delivery">
            <h2 id="garment-delivery" className={styles.stepTitle}>
              <span className={styles.stepNumber}>{number(4)}</span> {STEPS[4]}
            </h2>
            <p className={styles.placeholder}>
              You choose delivery or pickup at checkout, to one address or split across branches. Costs and dates are confirmed for your address.
            </p>
          </section>

          {/* 06 Review */}
          <section className={styles.step} id="step-review" aria-labelledby="garment-review">
            <h2 id="garment-review" className={styles.stepTitle}>
              <span className={styles.stepNumber}>{number(5)}</span> {STEPS[5]}
            </h2>
            <dl className={styles.review}>
              {(
                [
                  ["Garment", SOURCING.find((item) => item.value === sourcing)?.title ?? "Not chosen", "step-product"],
                  ...data.options.map((option) => [option.label, option.values.find((value) => value.key === choices[option.key])?.label ?? "Not chosen", "step-product"] as const),
                  ["Decoration", DECORATION.find((item) => item.value === decoration)?.title ?? "Not chosen", "step-customize"],
                  ["Placement", placements.map((placement) => POSITION_LABEL[placement.position]).join(", ") || "Not chosen", "step-customize"],
                  ["Quantity", sizesUnknown ? `${total || 0} (sizes later)` : `${sizeTotal} (${Object.entries(sizes).filter(([, value]) => value).map(([size, value]) => `${size} ${value}`).join(", ") || "no sizes"})`, "step-quantity"],
                  ["Artwork", ARTWORK.find((item) => item.value === artwork)?.title ?? "Not chosen", "step-artwork"],
                ] as const
              ).map(([label, value, anchor]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value}{" "}
                    <a href={`#${anchor}`}>
                      Edit<span className="hp-visually-hidden"> {label.toLowerCase()}</span>
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <div className={styles.totalBar} aria-live="polite">
            <div className={styles.totalRow}>
              <div>
                <p className={styles.summary}>
                  {price?.state === "ESTIMATE_READY" ? "ESTIMATED · " : ""}
                  {price?.quantity ? `${price.quantity} ${productName.toUpperCase()}` : productName.toUpperCase()}
                </p>
                <p className={styles.perUnit}>{price?.perUnitMinor ? `≈ ${naira(price.perUnitMinor)} each, including VAT` : "Add sizes or a quantity to see an estimate"}</p>
              </div>
              <p className={styles.total}>{price?.totalMinor ? naira(price.totalMinor) : "—"}</p>
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
            <Button fullWidth disabled title="Online ordering opens soon">
              Request a quote
            </Button>
            <p className={styles.perUnit}>Online ordering opens soon. Your design is saved as you go.</p>
            <div className={styles.saveState}>
              {saveState === "saving" ? <span>Saving…</span> : null}
              {saveState === "saved" ? <span>Draft saved</span> : null}
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
                {draft?.emailedTo ? `Link sent to ${draft.emailedTo}` : "Email me a link to this design"}
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
}
