"use client";

import { ApiError, type DeliveryZone, deliveryZoneSchema, NIGERIA_LGAS, NIGERIA_STATES } from "@holypearls/contracts";
import { Button, EmptyState, ErrorSummary, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { api } from "@holypearls/web-kit/api";
import { naira } from "@holypearls/web-kit/money";
import { toKobo } from "../format";
import styles from "./zones.module.css";

type Cover = DeliveryZone["covers"][number];
type Draft = { id: string | null; kind: DeliveryZone["kind"]; name: string; covers: Cover[]; pricing: "FIXED" | "QUOTE"; rate: string; transitMin: string; transitMax: string; version: number };

const blank: Draft = { id: null, kind: "AREA", name: "", covers: [], pricing: "FIXED", rate: "", transitMin: "", transitMax: "", version: 1 };

const toDraft = (zone: DeliveryZone): Draft => ({
  id: zone.id,
  kind: zone.kind,
  name: zone.name,
  covers: zone.covers,
  pricing: zone.pricing,
  rate: zone.rateMinor === null ? "" : (Number(zone.rateMinor) / 100).toString(),
  transitMin: zone.transitMinDays?.toString() ?? "",
  transitMax: zone.transitMaxDays?.toString() ?? "",
  version: zone.version,
});

/** "Ikeja, Yaba, Surulere +12" (Pen 108 COVERS column). */
function coversLabel(zone: DeliveryZone) {
  if (zone.kind === "REST_OF_NIGERIA") return "Everything not listed";
  if (zone.kind === "INTERNATIONAL") return "Outside Nigeria";
  const labels = zone.covers.map((cover) => (cover.lga ? cover.lga : cover.state === "FCT" ? "All FCT" : `All ${cover.state}`));
  return labels.length > 3 ? `${labels.slice(0, 3).join(", ")} +${labels.length - 3}` : labels.join(", ");
}


/**
 * Delivery zones and rates (Pen 108). The table says what checkout shows for
 * each zone; the panel edits one. Every address resolves to exactly one zone,
 * so an LGA or state already in another zone is refused.
 */
export function ZoneManager({ initial }: { initial: DeliveryZone[] }) {
  const router = useRouter();
  const [zones, setZones] = useState(initial);
  const [draft, setDraft] = useState<Draft>(initial.find((zone) => zone.kind === "AREA") ? toDraft(initial.find((zone) => zone.kind === "AREA")!) : blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; title: string; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickState, setPickState] = useState("");
  const [pickLga, setPickLga] = useState("");

  const choose = (next: Draft) => {
    setDraft(next);
    setErrors({});
    setNotice(null);
    setPickState("");
    setPickLga("");
  };

  const addCover = () => {
    if (!pickState) return;
    const cover: Cover = { state: pickState as Cover["state"], lga: pickLga || null };
    if (draft.covers.some((item) => item.state === cover.state && item.lga === cover.lga)) return;
    setDraft({ ...draft, covers: [...draft.covers, cover] });
    setPickLga("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const area = draft.kind === "AREA";
    if (area && !draft.name.trim()) next.name = "Name the zone";
    if (area && !draft.covers.length) next.covers = "Choose at least one state or LGA";
    const rateMinor = draft.pricing === "FIXED" ? toKobo(draft.rate) : null;
    if (draft.pricing === "FIXED" && rateMinor === null) next.rateMinor = "Enter the rate in naira, e.g. 6500";
    const days = (value: string) => (value.trim() === "" ? null : Number.parseInt(value, 10));
    const transitMinDays = days(draft.transitMin);
    const transitMaxDays = days(draft.transitMax);
    if ([transitMinDays, transitMaxDays].some((value) => value !== null && (Number.isNaN(value) || value < 0 || value > 60))) next.transitMaxDays = "Use whole working days from 0 to 60";
    else if (transitMinDays !== null && transitMaxDays !== null && transitMinDays > transitMaxDays) next.transitMaxDays = "The longest time can't be shorter than the shortest";
    setErrors(next);
    setNotice(null);
    if (Object.keys(next).length) return;

    const body = area
      ? { name: draft.name.trim(), covers: draft.covers, pricing: draft.pricing, rateMinor, transitMinDays, transitMaxDays, ...(draft.id ? { version: draft.version } : {}) }
      : { pricing: draft.pricing, rateMinor, transitMinDays, transitMaxDays, version: draft.version };
    setSaving(true);
    try {
      const saved = await api(draft.id ? `/v1/admin/delivery-zones/${draft.id}` : "/v1/admin/delivery-zones", { method: draft.id ? "PATCH" : "POST", body, response: deliveryZoneSchema });
      setZones((list) => (draft.id ? list.map((zone) => (zone.id === saved.id ? saved : zone)) : insertArea(list, saved)));
      choose(toDraft(saved));
      setNotice({ tone: "success", title: "Zone saved", body: `Checkout uses the new ${saved.name} rate for new checkouts. Existing checkouts keep their saved total.` });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) {
        setErrors(error.body.fieldErrors);
        if (error.body.fieldErrors.covers) setNotice({ tone: "error", title: "Can't save", body: error.body.fieldErrors.covers });
      } else setNotice({ tone: "error", title: "Can't save", body: error instanceof ApiError ? error.body.message : "Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id || draft.kind !== "AREA") return;
    if (!window.confirm(`Remove ${draft.name}? Addresses in it will use "Other Nigerian states" instead.`)) return;
    setSaving(true);
    try {
      await api(`/v1/admin/delivery-zones/${draft.id}`, { method: "DELETE", response: z.unknown() });
      const left = zones.filter((zone) => zone.id !== draft.id);
      setZones(left);
      choose(blank);
      setNotice({ tone: "success", title: "Zone removed", body: `${draft.name} is gone. Recorded in the audit log.` });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", title: "Not removed", body: error instanceof ApiError ? error.body.message : "Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  const lgas = NIGERIA_LGAS[pickState as keyof typeof NIGERIA_LGAS];
  const summary = Object.entries(errors).map(([key, message]) => ({ fieldId: `zone-${key === "rateMinor" ? "rate" : key === "transitMaxDays" ? "transit-max" : key}`, message }));
  const title = draft.id ? draft.name || "Zone" : "New zone";

  return (
    <>
    <header className={styles.pageHead}>
      <div>
        <p className={styles.eyebrow}>DELIVERY</p>
        <h1 className={styles.pageTitle}>Delivery zones and rates</h1>
      </div>
      <Button icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />} onClick={() => choose(blank)}>
        New zone
      </Button>
    </header>
    <div className={styles.columns}>
      <div className={styles.list}>
        {zones.length ? (
          <table className={styles.table}>
            <caption className="hp-visually-hidden">Delivery zones. Choose a zone to edit it.</caption>
            <thead>
              <tr>
                <th scope="col">ZONE</th>
                <th scope="col">COVERS</th>
                <th scope="col">CHECKOUT SHOWS</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.id} className={zone.id === draft.id ? styles.selected : undefined} onClick={() => choose(toDraft(zone))}>
                  <th scope="row">
                    <button type="button" className={styles.strong} aria-pressed={zone.id === draft.id} onClick={(event) => {
                      event.stopPropagation();
                      choose(toDraft(zone));
                    }}>
                      {zone.name}
                    </button>
                  </th>
                  <td className={styles.muted}>{coversLabel(zone)}</td>
                  <td>
                    {zone.pricing === "FIXED" ? (
                      <span className={styles.rate}>{naira(zone.rateMinor)}</span>
                    ) : zone.kind === "INTERNATIONAL" ? (
                      <StatusChip tone="info">Freight by quote</StatusChip>
                    ) : (
                      <StatusChip tone="warning">Quote required</StatusChip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No delivery zones" body={'Without zones every Nigerian delivery is "Quote required".'} />
        )}
      </div>

      <section className={styles.panel} aria-labelledby="zone-panel-title">
        <h2 id="zone-panel-title" className={styles.panelTitle}>
          {title}
        </h2>
        {notice ? (
          <Notice tone={notice.tone} title={notice.title} live>
            <p>{notice.body}</p>
          </Notice>
        ) : null}
        {summary.length ? <ErrorSummary errors={summary} title={summary.length === 1 ? "Fix 1 thing to save" : `Fix ${summary.length} things to save`} /> : null}
        <form noValidate onSubmit={(event) => void save(event)} className={styles.form}>
          {draft.kind === "AREA" ? (
            <>
              <FormField label="Zone name" id="zone-name" error={errors.name}>
                <TextField value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </FormField>
              <fieldset className={styles.covers} aria-describedby="zone-covers-help">
                <legend className={styles.label}>Covers (states / LGAs)</legend>
                {draft.covers.length ? (
                  <ul className={styles.chips}>
                    {draft.covers.map((cover) => (
                      <li key={`${cover.state}-${cover.lga ?? "all"}`}>
                        {cover.lga ? `${cover.lga}, ${cover.state}` : `All ${cover.state === "FCT" ? "FCT" : cover.state}`}
                        <button
                          type="button"
                          aria-label={`Remove ${cover.lga ?? cover.state}`}
                          onClick={() => setDraft({ ...draft, covers: draft.covers.filter((item) => item !== cover) })}
                        >
                          <X size={14} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className={styles.pick}>
                  <Select
                    searchable
                    id="zone-covers"
                    aria-label="State"
                    placeholder="State"
                    options={NIGERIA_STATES.map((state) => ({ value: state, label: state }))}
                    value={pickState}
                    aria-invalid={errors.covers ? true : undefined}
                    onValueChange={(next) => {
                      setPickState(next);
                      setPickLga("");
                    }}
                  />
                  <Select
                    aria-label="LGA"
                    options={[{ value: "", label: "Whole state" }, ...(lgas ?? []).map((lga) => ({ value: lga, label: lga }))]}
                    value={pickLga}
                    disabled={!lgas}
                    onValueChange={(next) => setPickLga(next)}
                  />
                  <Button type="button" variant="secondary" disabled={!pickState} onClick={addCover}>
                    Add
                  </Button>
                </div>
                <p id="zone-covers-help" className={styles.help}>
                  Every address resolves to exactly one zone. {lgas || !pickState ? "" : "This state is covered whole; LGAs aren't listed for it yet."}
                </p>
                {errors.covers ? (
                  <p className={styles.error} role="alert">
                    {errors.covers}
                  </p>
                ) : null}
              </fieldset>
            </>
          ) : (
            <p className={styles.help}>{draft.kind === "INTERNATIONAL" ? "Addresses outside Nigeria. Usually freight by quote." : "Nigerian addresses no other zone covers."}</p>
          )}

          <fieldset className={styles.radios}>
            <legend className={styles.label}>Pricing</legend>
            {(["FIXED", "QUOTE"] as const).map((value) => (
              <label key={value} className={styles.radio}>
                <input type="radio" name="zone-pricing" value={value} checked={draft.pricing === value} onChange={() => setDraft({ ...draft, pricing: value })} />
                {value === "FIXED" ? "Fixed rate" : "Quote required (staff price it)"}
              </label>
            ))}
          </fieldset>
          {draft.pricing === "FIXED" ? (
            <FormField label="Rate (NGN, before VAT)" id="zone-rate" hint="VAT is added at checkout when the VAT setting includes delivery." error={errors.rateMinor}>
              <TextField inputMode="decimal" value={draft.rate} onChange={(event) => setDraft({ ...draft, rate: event.target.value })} />
            </FormField>
          ) : null}
          <fieldset className={styles.covers}>
            <legend className={styles.label}>
              Transit time, working days <span className={styles.optional}>(optional)</span>
            </legend>
            <div className={styles.pair}>
              <FormField label="From" id="zone-transit-min">
                <TextField inputMode="numeric" value={draft.transitMin} onChange={(event) => setDraft({ ...draft, transitMin: event.target.value })} />
              </FormField>
              <FormField label="To" id="zone-transit-max" error={errors.transitMaxDays}>
                <TextField inputMode="numeric" value={draft.transitMax} onChange={(event) => setDraft({ ...draft, transitMax: event.target.value })} />
              </FormField>
            </div>
            <p className={styles.help}>Shown at checkout separately from production time.</p>
          </fieldset>
          <FormField label="Effective from" id="zone-effective" hint="Changes apply to new checkouts. Existing checkouts keep their saved total.">
            <TextField value="Now" readOnly />
          </FormField>
          <Button type="submit" fullWidth loading={saving}>
            Save zone
          </Button>
          {draft.id && draft.kind === "AREA" ? (
            <Button type="button" variant="tertiary" fullWidth disabled={saving} onClick={() => void remove()} icon={<Trash2 size={16} strokeWidth={2} aria-hidden="true" />}>
              Remove zone
            </Button>
          ) : null}
        </form>
      </section>
    </div>
    </>
  );
}

/** New area zones go after the other area zones, before the two fixed rows. */
function insertArea(list: DeliveryZone[], zone: DeliveryZone) {
  const at = list.findIndex((item) => item.kind !== "AREA");
  return at === -1 ? [...list, zone] : [...list.slice(0, at), zone, ...list.slice(at)];
}
