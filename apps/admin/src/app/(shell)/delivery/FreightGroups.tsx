"use client";

import { ApiError, type DeliveryZone, deliveryZoneSchema } from "@holypearls/contracts";
import { Button, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useState } from "react";
import { z } from "zod";
import styles from "../admin-list.module.css";
import css from "../form-layout.module.css";
import { money, toKobo, toNaira } from "../format";

type Form = { id: string | null; name: string; countries: string; pricing: "FIXED" | "QUOTE"; rate: string; transitMin: string; transitMax: string; version: number };
const BLANK: Form = { id: null, name: "", countries: "", pricing: "FIXED", rate: "", transitMin: "", transitMax: "", version: 1 };
const days = (text: string) => (text.trim() === "" ? null : /^\d+$/.test(text.trim()) ? Number(text) : NaN);

/**
 * International freight by destination group (Pen 119; OPS-FR-101): a
 * calculated rate, or staff will quote (the delivery-price queue). Countries
 * no group lists use the International zone.
 */
export function FreightGroups({ initial }: { initial: DeliveryZone[] }) {
  const [groups, setGroups] = useState(initial);
  const [form, setForm] = useState<Form>(BLANK);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const field = (key: "name" | "countries" | "rate" | "transitMin" | "transitMax") => ({ value: form[key], onChange: (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value }) });
  const edit = (zone: DeliveryZone | null) => {
    setNotice(null);
    setForm(zone ? { id: zone.id, name: zone.name, countries: zone.countries.join(", "), pricing: zone.pricing, rate: zone.rateMinor ? toNaira(zone.rateMinor) : "", transitMin: zone.transitMinDays?.toString() ?? "", transitMax: zone.transitMaxDays?.toString() ?? "", version: zone.version } : BLANK);
  };
  const failure = (error: unknown) => (error instanceof ApiError ? (Object.values(error.body.fieldErrors ?? {})[0] ?? error.body.message) : "That didn't save. Try again.");

  const save = async () => {
    const rateMinor = form.pricing === "FIXED" ? toKobo(form.rate) : null;
    const transitMinDays = days(form.transitMin);
    const transitMaxDays = days(form.transitMax);
    if ((form.pricing === "FIXED" && rateMinor === null) || Number.isNaN(transitMinDays) || Number.isNaN(transitMaxDays)) {
      setNotice({ tone: "error", text: "Enter the rate in naira and the delivery time in working days." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const body = { name: form.name, countries: form.countries.split(/[\s,]+/).filter(Boolean), pricing: form.pricing, rateMinor, transitMinDays, transitMaxDays, ...(form.id ? { version: form.version } : {}) };
      const saved = await api(form.id ? `/v1/admin/delivery-zones/countries/${form.id}` : "/v1/admin/delivery-zones/countries", { method: form.id ? "PUT" : "POST", body, response: deliveryZoneSchema });
      setGroups((all) => [...all.filter((zone) => zone.id !== saved.id), saved]);
      edit(null);
      setNotice({ tone: "success", text: `Freight to ${saved.name} saved. Checkout uses it from now on.` });
    } catch (error) {
      setNotice({ tone: "error", text: failure(error) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!form.id) return;
    setBusy(true);
    try {
      await api(`/v1/admin/delivery-zones/${form.id}`, { method: "DELETE", response: z.unknown() });
      setGroups((all) => all.filter((zone) => zone.id !== form.id));
      setNotice({ tone: "success", text: `${form.name} removed. Those countries use the International zone now.` });
      edit(null);
    } catch (error) {
      setNotice({ tone: "error", text: failure(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="freight-title">
      <h2 id="freight-title" className={styles.panelTitle}>
        International freight (OPS-FR-101)
      </h2>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      {groups.length ? (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Destinations abroad and how freight is priced</caption>
          <thead>
            <tr>
              <th scope="col">DESTINATION</th>
              <th scope="col">METHOD</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((zone) => (
              <tr key={zone.id}>
                <td>
                  <button type="button" className={styles.action} onClick={() => edit(zone)}>
                    {zone.name}
                  </button>
                  <span className={styles.hint}> · {zone.countries.join(", ")}</span>
                </td>
                <td>{zone.pricing === "FIXED" ? <StatusChip tone="success">{`CALCULATED RATE · ${money(zone.rateMinor!, "NGN")}`}</StatusChip> : <StatusChip tone="warning">STAFF WILL QUOTE</StatusChip>}</td>
              </tr>
            ))}
            <tr>
              <td>Rest of world</td>
              <td>
                <span className={styles.hint}>The International zone above</span>
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className={styles.hint}>Every country abroad uses the International zone. Add a group to give some countries their own rate.</p>
      )}
      <form
        className={css.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3 className={styles.panelTitle}>{form.id ? `Change ${form.name}` : "Add a destination group"}</h3>
        <FormField id="freight-name" label="Name">
          <TextField {...field("name")} />
        </FormField>
        <FormField id="freight-countries" label="Countries" hint="Two-letter codes, separated by commas: GH, TG, BJ.">
          <TextField autoComplete="off" {...field("countries")} />
        </FormField>
        <FormField id="freight-method" label="Method">
          <Select
            value={form.pricing}
            onValueChange={(next) => setForm({ ...form, pricing: next as Form["pricing"] })}
            options={[
              { value: "FIXED", label: "Calculated rate" },
              { value: "QUOTE", label: "Staff will quote" },
            ]}
          />
        </FormField>
        {form.pricing === "FIXED" ? (
          <div className={css.row}>
            <FormField id="freight-rate" label="Rate per shipment (₦, before VAT)">
              <TextField inputMode="decimal" {...field("rate")} />
            </FormField>
            <FormField id="freight-min" label="Working days, from" optional>
              <TextField inputMode="numeric" {...field("transitMin")} />
            </FormField>
            <FormField id="freight-max" label="to" optional>
              <TextField inputMode="numeric" {...field("transitMax")} />
            </FormField>
          </div>
        ) : null}
        <div className={css.actions}>
          <Button type="submit" loading={busy}>
            {form.id ? "Save group" : "Add group"}
          </Button>
          {form.id ? (
            <>
              <Button variant="tertiary" onClick={() => edit(null)}>
                Cancel
              </Button>
              <Button variant="tertiary" onClick={() => void remove()}>
                Remove {form.name}
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </section>
  );
}
