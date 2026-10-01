"use client";

import { ApiError, type Configuration, type ConfigurationDetails, quoteRequestResultSchema } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextField } from "@holypearls/ui";
import { type ReactNode, useState } from "react";
import { api } from "../../lib/api";
import styles from "./configurator.module.css";

/*
 * Answers for other product families, delivery timing, and Request Final
 * Quote (T03-08; COM-FR-045–047, 060–061, 070–072). Shared by the inline and
 * garment configurators.
 */

type Details = ConfigurationDetails;
type Change = (details: Details) => void;

function Choices<T extends string>({ name, value, options, onChange }: { name: string; value: T | undefined; options: { value: T; title: string; meta?: string }[]; onChange: (value: T) => void }) {
  return (
    <div className={styles.choices}>
      {options.map((option) => (
        <label key={option.value} className={styles.choice} htmlFor={`${name}-${option.value}`}>
          <input id={`${name}-${option.value}`} type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span className={styles.choiceTitle}>{option.title}</span>
          {option.meta ? <span className={styles.choiceMeta}>{option.meta}</span> : null}
        </label>
      ))}
    </div>
  );
}

function Text({ label, id, value, onChange, type = "text", hint }: { label: string; id: string; value: string | number | undefined; onChange: (value: string) => void; type?: string; hint?: string }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <FormField label={label} id={id} hint={hint}>
      <TextField
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(event.target.value);
        }}
      />
    </FormField>
  );
}

const TO_CM = { CM: 1, M: 100, IN: 2.54 } as const;
const round = (value: number) => Math.round(value * 100) / 100;

/** Custom size in the customer's unit, stored in centimetres, with the area (COM-FR-045). */
function CustomSize({ details, onChange }: { details: Details; onChange: Change }) {
  const unit = details.sizeUnit ?? "CM";
  const shown = (cm: number | undefined) => (cm ? round(cm / TO_CM[unit]) : undefined);
  const [width, setWidth] = useState(shown(details.widthCm));
  const [height, setHeight] = useState(shown(details.heightCm));
  const set = (w: number | undefined, h: number | undefined, u = unit) => {
    setWidth(w);
    setHeight(h);
    onChange({ sizeUnit: u, ...(w ? { widthCm: round(w * TO_CM[u]) } : {}), ...(h ? { heightCm: round(h * TO_CM[u]) } : {}) });
  };
  const area = width && height ? round((width * TO_CM[unit] * height * TO_CM[unit]) / 10_000) : null;
  const label = unit.toLowerCase();
  return (
    <div className={styles.fieldRow}>
      <FormField label="Unit" id="size-unit">
        <select className={styles.select} value={unit} onChange={(event) => set(width, height, event.target.value as keyof typeof TO_CM)}>
          <option value="CM">Centimetres</option>
          <option value="M">Metres</option>
          <option value="IN">Inches</option>
        </select>
      </FormField>
      <Text key={`w-${unit}`} label={`Width (${label})`} id="size-width" type="number" value={width} onChange={(value) => set(Number(value) || undefined, height)} />
      <Text key={`h-${unit}`} label={`Height (${label})`} id="size-height" type="number" value={height} onChange={(value) => set(width, Number(value) || undefined)} />
      <p className={styles.area} aria-live="polite">
        {area ? `Area ${area} m²` : "Enter both sides to see the area"}
      </p>
    </div>
  );
}

/** Family-specific questions (COM-FR-045–047, embroidery on whose garments). */
export function FamilyFields({ family, details, onChange }: { family: string; details: Details; onChange: Change }) {
  let body: ReactNode = null;
  if (family === "LARGE_FORMAT" || family === "WALL_ART") {
    body = (
      <>
        <Choices
          name="size-mode"
          value={details.sizeMode ?? "STANDARD"}
          options={[
            { value: "STANDARD", title: "Standard size", meta: "Chosen above · priced now" },
            { value: "CUSTOM", title: "Custom size", meta: "Your width and height · quoted" },
          ]}
          onChange={(sizeMode) => onChange({ sizeMode })}
        />
        {details.sizeMode === "CUSTOM" ? <CustomSize details={details} onChange={onChange} /> : null}
        {family === "LARGE_FORMAT" ? (
          <>
            <p className={styles.stepExtra}>How should it reach you?</p>
            <Choices
              name="service"
              value={details.service}
              options={[
                { value: "PRINT_ONLY", title: "Print only", meta: "Collect or we deliver the print" },
                { value: "DELIVERED", title: "Delivered", meta: "Delivery cost at checkout" },
                { value: "INSTALLATION", title: "Installation required", meta: "We install on site · quoted" },
              ]}
              onChange={(service) => onChange({ service })}
            />
            {details.service === "INSTALLATION" ? (
              <div className={styles.fieldGrid}>
                <Text label="Site address" id="install-site" value={details.installSite} onChange={(installSite) => onChange({ installSite })} />
                <Text label="Surface" id="install-surface" value={details.installSurface} hint="For example glass, painted wall, metal frame" onChange={(installSurface) => onChange({ installSurface })} />
                <Text label="Height from the ground (m)" id="install-height" type="number" value={details.installHeightM} onChange={(value) => onChange(Number(value) >= 0 && value ? { installHeightM: Number(value) } : {})} />
                <Text label="Access" id="install-access" value={details.installAccess} hint="Ladder, scaffold, lift, working hours" onChange={(installAccess) => onChange({ installAccess })} />
                <Text label="Preferred installation date" id="install-date" type="date" value={details.installDate} onChange={(value) => onChange(value ? { installDate: value } : {})} />
                <p className={styles.stepExtra}>Photos of the site help: add them as reference files in Artwork.</p>
              </div>
            ) : null}
          </>
        ) : null}
      </>
    );
  } else if (family === "PACKAGING") {
    body = (
      <>
        <Choices
          name="packaging-type"
          value={details.packagingType ?? "STANDARD"}
          options={[
            { value: "STANDARD", title: "Standard structure", meta: "Our sizes · configure now" },
            { value: "CUSTOM", title: "Custom structure", meta: "Your size and build · sample, then quote" },
          ]}
          onChange={(packagingType) => onChange({ packagingType })}
        />
        {details.packagingType === "CUSTOM" ? (
          <div className={styles.fieldGrid}>
            <Text label="Dimensions" id="pkg-spec" value={details.packagingSpec} hint="Width × height × depth" onChange={(packagingSpec) => onChange({ packagingSpec })} />
            <Text label="What it's for" id="pkg-use" value={details.packagingUse} onChange={(packagingUse) => onChange({ packagingUse })} />
            <Text label="Material" id="pkg-material" value={details.packagingMaterial} onChange={(packagingMaterial) => onChange({ packagingMaterial })} />
            <Text label="Closure" id="pkg-closure" value={details.packagingClosure} onChange={(packagingClosure) => onChange({ packagingClosure })} />
            <Text label="Handles" id="pkg-handles" value={details.packagingHandles} onChange={(packagingHandles) => onChange({ packagingHandles })} />
            <Text label="Insert" id="pkg-insert" value={details.packagingInsert} onChange={(packagingInsert) => onChange({ packagingInsert })} />
            <label className={styles.checkRow}>
              <input type="checkbox" checked={details.packagingSample ?? false} onChange={(event) => onChange({ packagingSample: event.target.checked })} /> Make a sample first
            </label>
          </div>
        ) : null}
      </>
    );
  } else if (family === "PROMOTIONAL_ITEM") {
    body = (
      <>
        <Choices
          name="promo-source"
          value={details.promoSource ?? "CATALOGUE"}
          options={[
            { value: "CATALOGUE", title: "This item", meta: "From our catalogue" },
            { value: "SOURCE_SIMILAR", title: "Source something similar", meta: "We check availability · quoted" },
          ]}
          onChange={(promoSource) => onChange({ promoSource })}
        />
        {details.promoSource === "SOURCE_SIMILAR" ? (
          <>
            <Text label="What are you looking for?" id="promo-similar" value={details.similarItem} onChange={(similarItem) => onChange({ similarItem })} />
            <p className={styles.stepExtra}>Sourced items aren&apos;t promised until we confirm they&apos;re available.</p>
          </>
        ) : null}
      </>
    );
  } else if (family === "EMBROIDERY" || family === "APPAREL_PRINT") {
    body = (
      <Choices
        name="garment-owner"
        value={details.garmentOwner ?? "OURS"}
        options={[
          { value: "OURS", title: "On garments you supply us with", meta: "We source the garments" },
          { value: "CUSTOMER", title: "On my own garments", meta: "Final price after we inspect them" },
        ]}
        onChange={(garmentOwner) => onChange({ garmentOwner })}
      />
    );
  }
  if (!body) return null;
  return (
    <fieldset className={styles.step}>
      <legend className={styles.stepExtra}>{family === "EMBROIDERY" || family === "APPAREL_PRINT" ? "Whose garments?" : family === "PROMOTIONAL_ITEM" ? "Item" : family === "PACKAGING" ? "Structure" : "Size"}</legend>
      {body}
    </fieldset>
  );
}

type Rush = "STANDARD" | "RUSH" | "PRIORITY";

/** Destination, date needed and timing, with production and transit shown separately (COM-FR-070–072). */
export function DeliveryFields({ draft, details, rush, onChange, onRush }: { draft: Configuration | null; details: Details; rush: Rush; onChange: Change; onRush: (rush: Rush) => void }) {
  const timing = draft?.timing ?? null;
  return (
    <>
      <Choices
        name="destination"
        value={details.destination}
        options={[
          { value: "LAGOS", title: "Lagos" },
          { value: "NIGERIA", title: "Elsewhere in Nigeria" },
          { value: "INTERNATIONAL", title: "Outside Nigeria", meta: "Freight confirmed in a quote" },
        ]}
        onChange={(destination) => onChange({ destination })}
      />
      <div className={styles.fieldGrid}>
        {details.destination && details.destination !== "LAGOS" ? <Text label="City" id="delivery-city" value={details.city} onChange={(city) => onChange({ city })} /> : null}
        {details.destination === "INTERNATIONAL" ? <Text label="Country" id="delivery-country" value={details.country} onChange={(country) => onChange({ country })} /> : null}
        <Text label="Needed by" id="needed-by" type="date" value={details.deadline} hint="Optional. We check it against production and delivery." onChange={(value) => onChange(value ? { deadline: value } : {})} />
      </div>
      <p className={styles.stepExtra}>Timing</p>
      <Choices
        name="timing"
        value={rush}
        options={[
          { value: "STANDARD", title: "Standard" },
          { value: "RUSH", title: "Rush", meta: "Faster, with a surcharge where offered" },
          { value: "PRIORITY", title: "Priority rush", meta: "Reviewed by production first" },
        ]}
        onChange={onRush}
      />
      {timing ? (
        <div className={styles.timing} aria-live="polite">
          <p>{timing.production ? `Production: ${timing.production.min}–${timing.production.max} working days after proof approval` : "Production: confirmed by our team"}</p>
          <p>
            {timing.transitQuoted
              ? "Delivery: freight and transit confirmed in your quote"
              : timing.transit
                ? `Delivery: ${timing.transit.min}–${timing.transit.max} working days`
                : "Delivery: choose where it's going"}
          </p>
          {timing.message ? <p className={timing.verdict === "ON_TIME" ? undefined : styles.timingWarn}>{timing.message}</p> : null}
          {timing.suggestedRush && timing.suggestedRush !== rush ? (
            <Button variant="secondary" onClick={() => onRush(timing.suggestedRush!)}>
              Switch to {timing.suggestedRush === "RUSH" ? "rush" : "priority rush"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * Request Final Quote (COM-FR-061): the design and every answer go with it;
 * the customer gets a reference and a link back.
 */
export function QuoteRequest({
  draft,
  ensure,
  onRequested,
  buttonClassName,
  children,
}: {
  draft: Configuration | null;
  ensure: () => Promise<Configuration | null>;
  onRequested: (reference: string) => void;
  /** The product page's own button style (Ledger ticket); the shared Button otherwise. */
  buttonClassName?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  if (draft?.quote) {
    return (
      <Notice tone="success" title={`Quote requested · ${draft.quote.reference}`} live>
        <p>We&apos;re reviewing your design and will email your quote. Every choice is saved with it.</p>
      </Notice>
    );
  }
  const send = async () => {
    setSending(true);
    setErrors({});
    try {
      const current = await ensure();
      if (!current) return;
      const result = await api(`/v1/configurations/${current.id}/quote-request`, {
        method: "POST",
        body: { name: form.name, email: form.email, ...(form.phone && { phone: form.phone }), ...(form.note && { note: form.note }) },
        response: quoteRequestResultSchema,
      });
      setOpen(false);
      onRequested(result.reference);
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setErrors({ form: error instanceof ApiError && error.body.message ? error.body.message : "We couldn't send it. Try again." });
    } finally {
      setSending(false);
    }
  };
  const blocking = draft?.price?.reasons.find((reason) => reason.blocking);
  return (
    <>
      {buttonClassName ? (
        <button type="button" className={buttonClassName} disabled={!draft?.price || Boolean(blocking)} onClick={() => setOpen(true)}>
          Request Final Quote
          {children}
        </button>
      ) : (
        <Button fullWidth disabled={!draft?.price || Boolean(blocking)} onClick={() => setOpen(true)}>
          Request Final Quote
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Request Final Quote"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void send()} disabled={sending}>
              Send quote request
            </Button>
          </>
        }
      >
        <p>We review your design, confirm anything we can&apos;t price automatically, and email your quote. Nothing is charged yet.</p>
        {errors.form ? <p role="alert">{errors.form}</p> : null}
        <FormField label="Your name" id="quote-name" error={errors.name}>
          <TextField autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </FormField>
        <FormField label="Email" id="quote-email" error={errors.email}>
          <TextField type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </FormField>
        <FormField label="Phone (optional)" id="quote-phone" error={errors.phone}>
          <TextField type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </FormField>
        <FormField label="Anything we should know? (optional)" id="quote-note" error={errors.note}>
          <TextField value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
        </FormField>
      </Dialog>
    </>
  );
}
