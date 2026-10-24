"use client";

import { type AdminPriceRule, adminPriceRuleListSchema, adminPriceRuleSchema, type AdminProductRules, ApiError } from "@holypearls/contracts";
import { Button, Checkbox, DatePicker, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { StepUpDialog } from "@/components/StepUpDialog";
import { useState } from "react";
import styles from "../../admin-list.module.css";
import { formatTime, money, toKobo, toNaira } from "../../format";
import css from "../../form-layout.module.css";

type Tier = { from: string; amount: string };
type AddOn = { option: string; value: string; per: "UNIT" | "ORDER"; amount: string };
const LAGOS = "+01:00";

/** "Now" in Lagos as a datetime-local value, to the minute. */
const lagosNow = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
const basisLabel = (rule: AdminPriceRule) => (rule.basis === "PER_UNIT" ? "/ unit" : rule.basis === "PER_PACK" ? `/ pack of ${rule.packSize}` : "fixed");

/**
 * Price rules (Pen 107 · JElIg; OPS-FR-010, 130): every price version with its
 * date, and a new version from a chosen date. History is never edited; a
 * change is a new version. Accepted quotes and existing orders never change.
 */
export function PriceVersions({ productId, initial, options }: { productId: string; initial: AdminPriceRule[]; options: AdminProductRules["options"] }) {
  const [entries, setEntries] = useState(initial);
  const now = Date.now();
  const latest = entries[0];
  const [from, setFrom] = useState(lagosNow);
  const [currency, setCurrency] = useState<AdminPriceRule["currency"]>(latest?.currency ?? "NGN");
  const [basis, setBasis] = useState<AdminPriceRule["basis"]>(latest?.basis ?? "PER_UNIT");
  const [packSize, setPackSize] = useState(String(latest?.packSize ?? 1));
  const [base, setBase] = useState(latest ? toNaira(latest.baseMinor) : "");
  const [tiers, setTiers] = useState<Tier[]>(latest?.tiers.map((tier) => ({ from: String(tier.minQuantity), amount: toNaira(tier.amountMinor) })) ?? []);
  const [addOns, setAddOns] = useState<AddOn[]>(latest?.addOns.map((addOn) => ({ ...addOn, amount: toNaira(addOn.amountMinor) })) ?? []);
  const [state, setState] = useState<AdminPriceRule["state"]>(latest?.state ?? "PRICE_READY");
  const [includesVat, setIncludesVat] = useState(latest?.includesVat ?? false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const valuesOf = (key: string) => options.find((option) => option.key === key)?.values ?? [];

  const save = async () => {
    const baseMinor = toKobo(base);
    const tierRows = tiers.map((tier) => ({ minQuantity: /^\d+$/.test(tier.from.trim()) ? Number(tier.from) : NaN, amountMinor: toKobo(tier.amount) }));
    const addOnRows = addOns.map((addOn) => ({ option: addOn.option, value: addOn.value, per: addOn.per, amountMinor: toKobo(addOn.amount) }));
    if (baseMinor === null || tierRows.some((tier) => !Number.isInteger(tier.minQuantity) || tier.minQuantity < 2 || tier.amountMinor === null) || addOnRows.some((addOn) => addOn.amountMinor === null)) {
      setNotice({ tone: "error", text: "Enter prices in naira, and tiers that start at 2 or more." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const added = await api(`/v1/admin/pricing/products/${productId}/prices`, {
        method: "POST",
        body: { effectiveFrom: `${from}:00${LAGOS}`, currency, basis, packSize: Number(packSize) || 1, baseMinor, tiers: tierRows, addOns: addOnRows, state, includesVat, note: note.trim() || null },
        response: adminPriceRuleSchema,
      });
      setEntries((await api(`/v1/admin/pricing/products/${productId}/prices`, { response: adminPriceRuleListSchema })).entries);
      setNote("");
      setStepUp(false);
      setNotice({ tone: "success", text: `Price version scheduled. New prices take effect ${formatTime(added.effectiveFrom)}. Accepted quotes and orders are unchanged. Recorded in the audit log.` });
    } catch (error) {
      // A price change is high-risk (PRD-06 §18): confirm with the authenticator, then it saves.
      if (errorCode(error) === "RECENT_MFA_REQUIRED") setStepUp(true);
      else setNotice({ tone: "error", text: error instanceof ApiError ? (Object.values(error.body.fieldErrors ?? {})[0] ?? error.body.message) : "That didn't save. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css.layout}>
      <section className={styles.panel} aria-labelledby="versions-title">
        <h2 id="versions-title" className={styles.panelTitle}>
          Price versions
        </h2>
        {entries.length === 0 ? (
          <p className={styles.hint}>No price yet, so every configuration needs a quote.</p>
        ) : (
          <table className={styles.table}>
            <caption className="hp-visually-hidden">Price versions, newest first</caption>
            <thead>
              <tr>
                <th scope="col">FROM</th>
                <th scope="col">PRICE</th>
                <th scope="col">TIERS</th>
                <th scope="col">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className={styles.mono}>{formatTime(entry.effectiveFrom)}</td>
                  <td>
                    {money(entry.baseMinor, entry.currency)} {basisLabel(entry)}
                    <span className={styles.hint}>
                      {" "}
                      · {entry.state === "PRICE_READY" ? "exact" : "estimate"}
                      {entry.includesVat ? " · incl. VAT" : ""}
                      {entry.addOns.length ? ` · ${entry.addOns.length} add-on${entry.addOns.length === 1 ? "" : "s"}` : ""}
                    </span>
                    {entry.note ? <span className={styles.hint}> · {entry.note}</span> : null}
                  </td>
                  <td>{entry.tiers.length ? entry.tiers.map((tier) => `${tier.minQuantity.toLocaleString("en-NG")}+ ${money(tier.amountMinor, entry.currency)}`).join(" · ") : "—"}</td>
                  <td>
                    {entry.current ? (
                      <StatusChip tone="success">CURRENT</StatusChip>
                    ) : Date.parse(entry.effectiveFrom) > now ? (
                      <StatusChip tone="info">SCHEDULED</StatusChip>
                    ) : (
                      <StatusChip tone="neutral">PAST</StatusChip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className={styles.panel} aria-labelledby="new-version-title">
        <h2 id="new-version-title" className={styles.panelTitle}>
          New price version
        </h2>
        <p className={styles.hint}>Accepted quotes and existing orders never change. Draft configurations are repriced and show &quot;Price updated&quot; (OPS-FR-130).</p>
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
          <FormField id="price-from" label="Effective from (Lagos time)" hint="Now, or a later date. Past prices can't be changed.">
            <DatePicker withTime value={from} onValueChange={setFrom} />
          </FormField>
          <div className={css.row}>
            <FormField id="price-basis" label="Priced">
              <Select
                value={basis}
                onValueChange={(next) => setBasis(next as AdminPriceRule["basis"])}
                options={[
                  { value: "PER_UNIT", label: "Per unit" },
                  { value: "PER_PACK", label: "Per pack" },
                  { value: "FIXED", label: "Fixed" },
                ]}
              />
            </FormField>
            {basis === "PER_PACK" ? (
              <FormField id="price-pack" label="Pack size">
                <TextField inputMode="numeric" value={packSize} onChange={(event) => setPackSize(event.target.value)} />
              </FormField>
            ) : null}
            <FormField id="price-currency" label="Currency">
              <Select
                value={currency}
                onValueChange={(next) => setCurrency(next as AdminPriceRule["currency"])}
                options={[
                  { value: "NGN", label: "Naira (₦)" },
                  { value: "USD", label: "US dollars ($)" },
                ]}
              />
            </FormField>
          </div>
          <FormField id="price-base" label={`Base price (${currency === "USD" ? "$" : "₦"})`} hint={tiers.length ? `Below ${tiers[0]?.from || "the first tier"}` : undefined}>
            <TextField inputMode="decimal" value={base} onChange={(event) => setBase(event.target.value)} />
          </FormField>
          <fieldset className={css.form}>
            <legend className={styles.strong}>Quantity tiers</legend>
            {tiers.map((tier, index) => (
              <div key={index} className={css.row}>
                <FormField id={`tier-from-${index}`} label="From quantity">
                  <TextField inputMode="numeric" value={tier.from} onChange={(event) => setTiers(tiers.map((row, at) => (at === index ? { ...row, from: event.target.value } : row)))} />
                </FormField>
                <FormField id={`tier-amount-${index}`} label="Price">
                  <TextField inputMode="decimal" value={tier.amount} onChange={(event) => setTiers(tiers.map((row, at) => (at === index ? { ...row, amount: event.target.value } : row)))} />
                </FormField>
                <Button variant="tertiary" onClick={() => setTiers(tiers.filter((_, at) => at !== index))}>
                  Remove tier {index + 1}
                </Button>
              </div>
            ))}
            <div className={css.actions}>
              <Button variant="secondary" onClick={() => setTiers([...tiers, { from: "", amount: "" }])}>
                Add a tier
              </Button>
            </div>
          </fieldset>
          <fieldset className={css.form}>
            <legend className={styles.strong}>Add-on charges</legend>
            {addOns.map((addOn, index) => (
              <div key={index} className={css.row}>
                <FormField id={`addon-option-${index}`} label="Option">
                  <Select
                    value={addOn.option}
                    onValueChange={(next) => setAddOns(addOns.map((row, at) => (at === index ? { ...row, option: next, value: valuesOf(next)[0]?.key ?? "" } : row)))}
                    options={options.map((option) => ({ value: option.key, label: option.label }))}
                  />
                </FormField>
                <FormField id={`addon-value-${index}`} label="Choice">
                  <Select value={addOn.value} onValueChange={(next) => setAddOns(addOns.map((row, at) => (at === index ? { ...row, value: next } : row)))} options={valuesOf(addOn.option).map((value) => ({ value: value.key, label: value.label }))} />
                </FormField>
                <FormField id={`addon-per-${index}`} label="Charged">
                  <Select
                    value={addOn.per}
                    onValueChange={(next) => setAddOns(addOns.map((row, at) => (at === index ? { ...row, per: next as AddOn["per"] } : row)))}
                    options={[
                      { value: "UNIT", label: "Per unit" },
                      { value: "ORDER", label: "Per order" },
                    ]}
                  />
                </FormField>
                <FormField id={`addon-amount-${index}`} label="Charge">
                  <TextField inputMode="decimal" value={addOn.amount} onChange={(event) => setAddOns(addOns.map((row, at) => (at === index ? { ...row, amount: event.target.value } : row)))} />
                </FormField>
                <Button variant="tertiary" onClick={() => setAddOns(addOns.filter((_, at) => at !== index))}>
                  Remove add-on {index + 1}
                </Button>
              </div>
            ))}
            <div className={css.actions}>
              <Button variant="secondary" disabled={!options.length} onClick={() => setAddOns([...addOns, { option: options[0]!.key, value: options[0]!.values[0]?.key ?? "", per: "UNIT", amount: "" }])}>
                Add an add-on
              </Button>
            </div>
          </fieldset>
          <FormField id="price-state" label="This price is">
            <Select
              value={state}
              onValueChange={(next) => setState(next as AdminPriceRule["state"])}
              options={[
                { value: "PRICE_READY", label: "Exact (PRICE_READY)" },
                { value: "ESTIMATE_READY", label: "An estimate (ESTIMATE_READY)" },
              ]}
            />
          </FormField>
          <Checkbox id="price-vat" label="Prices include VAT" checked={includesVat} onChange={(event) => setIncludesVat(event.target.checked)} />
          <FormField id="price-note" label="Note" optional hint="Why the price changed, for the audit log.">
            <TextField value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
          <div className={css.actions}>
            <Button type="submit" loading={busy}>
              Save price version
            </Button>
          </div>
        </form>
        <StepUpDialog open={stepUp} action="Schedule a new price version" confirmLabel="Confirm and save" onClose={() => setStepUp(false)} onVerified={save} />
      </section>
    </div>
  );
}
