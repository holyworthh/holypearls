"use client";

import { type AdminProductRules, adminProductRulesSchema, ApiError, type ProductRules } from "@holypearls/contracts";
import { Button, Checkbox, FormField, Notice, Select, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useState } from "react";
import styles from "../../admin-list.module.css";
import { toKobo, toNaira } from "../../format";
import css from "./rules.module.css";

type Compatibility = AdminProductRules["compatibility"][number];

/** A product with no rules starts from the common case: ten or more, a week, proofs required. */
const DEFAULTS: ProductRules = {
  moq: 10,
  belowMoq: "BLOCK",
  belowMoqSurchargeBps: 0,
  maxAutoQuantity: null,
  leadMinDays: 3,
  leadMaxDays: 7,
  rush: "NONE",
  rushSurchargeBps: 0,
  priorityRush: "NONE",
  priorityRushSurchargeBps: 0,
  artworkLater: true,
  sample: "NOT_OFFERED",
  sampleMultiplierBps: 10_000,
  sampleMinimumMinor: "0",
  proof: "REQUIRED",
  proofSkippableOnReorder: true,
};

const AVAILABILITY = [
  { value: "NONE", label: "Not offered" },
  { value: "AVAILABLE", label: "Offered, priced automatically" },
  { value: "MANUAL_REVIEW", label: "Offered, staff review it" },
];

/** Basis points shown as a percentage: 3000 → "30". */
const percent = (bps: number) => String(bps / 100);
const toBps = (text: string) => (/^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text) * 100) : null);
const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : null);

/** What failed, in the API's words: a field's message, or the general one. */
const failure = (error: unknown) =>
  error instanceof ApiError
    ? error.body.code === "VERSION_CONFLICT"
      ? "Someone else changed these rules. Reload to see them."
      : (Object.values(error.body.fieldErrors ?? {})[0] ?? error.body.message)
    : "That didn't save. Try again.";

/**
 * Product rules (Pen 107 · pGEKn; OPS-FR-011–013, 016–018): minimum and what
 * happens below it, lead times and rush, artwork, samples and proofs, then
 * what works together. Saving bumps the rules' version, which every new
 * price calculation records.
 */
export function ProductRulesForm({ productId, initial }: { productId: string; initial: AdminProductRules }) {
  const start = initial.rules ?? DEFAULTS;
  const [version, setVersion] = useState(initial.version);
  const [text, setText] = useState({
    moq: String(start.moq),
    belowMoqSurcharge: percent(start.belowMoqSurchargeBps),
    maxAuto: start.maxAutoQuantity === null ? "" : String(start.maxAutoQuantity),
    leadMin: String(start.leadMinDays),
    leadMax: String(start.leadMaxDays),
    rushSurcharge: percent(start.rushSurchargeBps),
    prioritySurcharge: percent(start.priorityRushSurchargeBps),
    sampleMultiplier: percent(start.sampleMultiplierBps),
    sampleMinimum: toNaira(start.sampleMinimumMinor),
  });
  const [choice, setChoice] = useState({ belowMoq: start.belowMoq, rush: start.rush, priorityRush: start.priorityRush, artworkLater: start.artworkLater, sample: start.sample, proof: start.proof, proofSkippableOnReorder: start.proofSkippableOnReorder });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const field = (key: keyof typeof text) => ({ value: text[key], onChange: (event: { target: { value: string } }) => setText({ ...text, [key]: event.target.value }) });

  const save = async () => {
    const numbers = {
      moq: whole(text.moq),
      leadMinDays: whole(text.leadMin),
      leadMaxDays: whole(text.leadMax),
      belowMoqSurchargeBps: toBps(text.belowMoqSurcharge),
      rushSurchargeBps: toBps(text.rushSurcharge),
      priorityRushSurchargeBps: toBps(text.prioritySurcharge),
      sampleMultiplierBps: toBps(text.sampleMultiplier),
    };
    const missing = Object.entries(numbers).find(([, value]) => value === null);
    const sampleMinimumMinor = toKobo(text.sampleMinimum || "0");
    const maxAutoQuantity = text.maxAuto.trim() ? whole(text.maxAuto) : null;
    if (missing || sampleMinimumMinor === null || (text.maxAuto.trim() && maxAutoQuantity === null)) {
      setNotice({ tone: "error", text: "Enter whole numbers for quantities and days, percentages like 30 or 7.5, and amounts in naira." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api(`/v1/admin/pricing/products/${productId}/rules`, {
        method: "PUT",
        body: { rules: { ...numbers, ...choice, maxAutoQuantity, sampleMinimumMinor }, version },
        response: adminProductRulesSchema,
      });
      setVersion(saved.version);
      setNotice({ tone: "success", text: "Rules saved. New price calculations use them now; accepted quotes and orders are unchanged." });
    } catch (error) {
      setNotice({ tone: "error", text: failure(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css.layout}>
      <section className={styles.panel} aria-labelledby="rules-title">
        <h2 id="rules-title" className={styles.panelTitle}>
          Product rules
        </h2>
        {notice ? (
          <Notice tone={notice.tone} live>
            <p>{notice.text}</p>
          </Notice>
        ) : null}
        <form
          className={css.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h3 className={styles.panelTitle}>Minimum order (OPS-FR-011)</h3>
          <div className={css.row}>
            <FormField id="rules-moq" label="Minimum order quantity">
              <TextField inputMode="numeric" {...field("moq")} />
            </FormField>
            <FormField id="rules-below" label="Below the minimum">
              <Select
                value={choice.belowMoq}
                onChange={(event) => setChoice({ ...choice, belowMoq: event.target.value as ProductRules["belowMoq"] })}
                options={[
                  { value: "BLOCK", label: "Block the order" },
                  { value: "MANUAL_REVIEW", label: "Send for manual review" },
                  { value: "SURCHARGE", label: "Allow with a surcharge" },
                ]}
              />
            </FormField>
            {choice.belowMoq === "SURCHARGE" ? (
              <FormField id="rules-below-surcharge" label="Surcharge (%)">
                <TextField inputMode="decimal" {...field("belowMoqSurcharge")} />
              </FormField>
            ) : null}
          </div>
          <FormField id="rules-max-auto" label="Automatic price up to" optional hint="Larger quantities need a quote. Leave empty for no limit.">
            <TextField inputMode="numeric" {...field("maxAuto")} />
          </FormField>

          <h3 className={styles.panelTitle}>Lead time and rush (OPS-FR-012)</h3>
          <div className={css.row}>
            <FormField id="rules-lead-min" label="Working days, from">
              <TextField inputMode="numeric" {...field("leadMin")} />
            </FormField>
            <FormField id="rules-lead-max" label="to">
              <TextField inputMode="numeric" {...field("leadMax")} />
            </FormField>
          </div>
          <div className={css.row}>
            <FormField id="rules-rush" label="Rush">
              <Select value={choice.rush} onChange={(event) => setChoice({ ...choice, rush: event.target.value as ProductRules["rush"] })} options={AVAILABILITY} />
            </FormField>
            {choice.rush !== "NONE" ? (
              <FormField id="rules-rush-surcharge" label="Rush surcharge (%)">
                <TextField inputMode="decimal" {...field("rushSurcharge")} />
              </FormField>
            ) : null}
          </div>
          <div className={css.row}>
            <FormField id="rules-priority" label="Priority rush">
              <Select value={choice.priorityRush} onChange={(event) => setChoice({ ...choice, priorityRush: event.target.value as ProductRules["priorityRush"] })} options={AVAILABILITY} />
            </FormField>
            {choice.priorityRush !== "NONE" ? (
              <FormField id="rules-priority-surcharge" label="Priority surcharge (%)">
                <TextField inputMode="decimal" {...field("prioritySurcharge")} />
              </FormField>
            ) : null}
          </div>

          <h3 className={styles.panelTitle}>Artwork, samples and proofs (OPS-FR-016–018)</h3>
          <Checkbox id="rules-artwork-later" label="Artwork can be sent later" checked={choice.artworkLater} onChange={(event) => setChoice({ ...choice, artworkLater: event.target.checked })} />
          <div className={css.row}>
            <FormField id="rules-sample" label="Samples">
              <Select
                value={choice.sample}
                onChange={(event) => setChoice({ ...choice, sample: event.target.value as ProductRules["sample"] })}
                options={[
                  { value: "NOT_OFFERED", label: "Not offered" },
                  { value: "OPTIONAL", label: "Optional" },
                  { value: "RECOMMENDED", label: "Recommended" },
                  { value: "REQUIRED", label: "Required" },
                ]}
              />
            </FormField>
            {choice.sample !== "NOT_OFFERED" ? (
              <>
                <FormField id="rules-sample-multiplier" label="Sample price (% of unit price)">
                  <TextField inputMode="decimal" {...field("sampleMultiplier")} />
                </FormField>
                <FormField id="rules-sample-minimum" label="At least (₦)">
                  <TextField inputMode="decimal" {...field("sampleMinimum")} />
                </FormField>
              </>
            ) : null}
          </div>
          <FormField id="rules-proof" label="Proof">
            <Select
              value={choice.proof}
              onChange={(event) => setChoice({ ...choice, proof: event.target.value as ProductRules["proof"] })}
              options={[
                { value: "REQUIRED", label: "Required" },
                { value: "OPTIONAL", label: "Optional" },
                { value: "NOT_REQUIRED", label: "Not required" },
              ]}
            />
          </FormField>
          <Checkbox id="rules-proof-reorder" label="An exact reorder can skip the proof" checked={choice.proofSkippableOnReorder} onChange={(event) => setChoice({ ...choice, proofSkippableOnReorder: event.target.checked })} />
          <div className={css.actions}>
            <Button type="submit" loading={busy}>
              Save rules
            </Button>
          </div>
        </form>
      </section>
      <CompatibilityEditor productId={productId} initial={initial} version={version} onSaved={setVersion} />
    </div>
  );
}

/**
 * What works together (OPS-FR-013): when one choice is made, some values of
 * another are not allowed, or need review (the price state becomes
 * QUOTE_REQUIRED). The whole set is saved at once.
 */
function CompatibilityEditor({ productId, initial, version, onSaved }: { productId: string; initial: AdminProductRules; version: number; onSaved: (version: number) => void }) {
  const { options } = initial;
  const [rows, setRows] = useState<Compatibility[]>(initial.compatibility);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const valuesOf = (key: string) => options.find((option) => option.key === key)?.values ?? [];
  const optionChoices = options.map((option) => ({ value: option.key, label: option.label }));
  const update = (index: number, change: Partial<Compatibility>) => setRows(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
  const add = () => {
    const [first, second] = options;
    if (!first || !second) return;
    setRows([...rows, { ifOption: first.key, ifValue: first.values[0]?.key ?? "", thenOption: second.key, thenValues: [], effect: "NOT_ALLOWED", message: "" }]);
  };
  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api(`/v1/admin/pricing/products/${productId}/compatibility`, { method: "PUT", body: { rules: rows, version }, response: adminProductRulesSchema });
      onSaved(saved.version);
      setRows(saved.compatibility);
      setNotice({ tone: "success", text: "Saved. New price calculations check these now." });
    } catch (error) {
      setNotice({ tone: "error", text: failure(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="compatibility-title">
      <h2 id="compatibility-title" className={styles.panelTitle}>
        Compatibility (OPS-FR-013)
      </h2>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      {version === 0 ? <p className={styles.hint}>Save the product rules first; compatibility belongs to them.</p> : null}
      {options.length < 2 ? <p className={styles.hint}>This product needs at least two options before choices can depend on each other.</p> : null}
      {rows.length === 0 ? <p className={styles.hint}>Every combination of choices works.</p> : null}
      {rows.map((row, index) => (
        <fieldset key={index} className={css.form}>
          <legend className={styles.strong}>Rule {index + 1}</legend>
          <div className={css.row}>
            <FormField id={`compat-if-${index}`} label="When">
              <Select value={row.ifOption} onChange={(event) => update(index, { ifOption: event.target.value, ifValue: valuesOf(event.target.value)[0]?.key ?? "" })} options={optionChoices} />
            </FormField>
            <FormField id={`compat-if-value-${index}`} label="is">
              <Select value={row.ifValue} onChange={(event) => update(index, { ifValue: event.target.value })} options={valuesOf(row.ifOption).map((value) => ({ value: value.key, label: value.label }))} />
            </FormField>
            <FormField id={`compat-then-${index}`} label="then">
              <Select value={row.thenOption} onChange={(event) => update(index, { thenOption: event.target.value, thenValues: [] })} options={optionChoices} />
            </FormField>
            <FormField id={`compat-effect-${index}`} label="these are">
              <Select
                value={row.effect}
                onChange={(event) => update(index, { effect: event.target.value as Compatibility["effect"] })}
                options={[
                  { value: "NOT_ALLOWED", label: "Not allowed" },
                  { value: "NEEDS_REVIEW", label: "Allowed after review" },
                ]}
              />
            </FormField>
          </div>
          {valuesOf(row.thenOption).map((value) => (
            <Checkbox
              key={value.key}
              id={`compat-value-${index}-${value.key}`}
              label={value.label}
              checked={row.thenValues.includes(value.key)}
              onChange={(event) => update(index, { thenValues: event.target.checked ? [...row.thenValues, value.key] : row.thenValues.filter((key) => key !== value.key) })}
            />
          ))}
          <FormField id={`compat-message-${index}`} label="What the customer is told">
            <TextField value={row.message} onChange={(event) => update(index, { message: event.target.value })} />
          </FormField>
          <div className={css.actions}>
            <Button variant="tertiary" onClick={() => setRows(rows.filter((_, at) => at !== index))}>
              Remove rule {index + 1}
            </Button>
          </div>
        </fieldset>
      ))}
      <div className={css.actions}>
        <Button variant="secondary" onClick={add} disabled={options.length < 2}>
          Add a rule
        </Button>
        <Button loading={busy} onClick={() => void save()} disabled={version === 0}>
          Save compatibility
        </Button>
      </div>
    </section>
  );
}
