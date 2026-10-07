"use client";

import { ApiError, courierCategoriesSchema, type CourierSettings, courierSettingsSchema } from "@holypearls/contracts";
import { Button, FormField, Notice, Select, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useEffect, useState } from "react";
import styles from "../admin-list.module.css";

/**
 * Courier prices through Shipbubble (T08-05; owner, 2026-10-05). Addresses
 * outside the zones get a live courier price at checkout; without one, staff
 * price them in Delivery prices. The pickup address is checked with the
 * courier when saved. There's no Pen frame; it follows the admin form panels.
 */
export function CourierSettingsPanel({ initial }: { initial: CourierSettings }) {
  const [settings, setSettings] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [rule, setRule] = useState(initial.rule);
  const [categoryId, setCategoryId] = useState(initial.categoryId ? String(initial.categoryId) : "");
  const [pickup, setPickup] = useState({ name: initial.pickup?.name ?? "", email: initial.pickup?.email ?? "", phone: initial.pickup?.phone ?? "", address: initial.pickup?.address ?? "" });
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initial.available) return;
    api("/v1/admin/courier-settings/categories", { response: courierCategoriesSchema })
      .then((data) => setCategories(data.categories))
      .catch(() => setResult({ tone: "error", text: "We couldn't load Shipbubble's package types. Check the key, then reload." }));
  }, [initial.available]);

  const save = async () => {
    setBusy(true);
    setErrors({});
    setResult(null);
    try {
      const saved = await api("/v1/admin/courier-settings", {
        method: "PUT",
        body: { enabled, rule, categoryId: Number(categoryId) || 0, pickup, version: settings.version },
        response: courierSettingsSchema,
      });
      setSettings(saved);
      setResult({ tone: "success", text: saved.enabled ? "Saved. Checkouts outside the zones now get courier prices." : "Saved. Courier prices are off; our team prices addresses outside the zones." });
    } catch (problem) {
      if (problem instanceof ApiError) {
        setErrors(problem.body.fieldErrors ?? {});
        setResult({ tone: "error", text: problem.body.code === "VERSION_CONFLICT" ? "Someone else saved first. Reload to see their changes." : problem.body.message });
      } else setResult({ tone: "error", text: "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof pickup, label: string, hint?: string) => (
    <FormField id={`pickup-${key}`} label={label} hint={hint} error={errors[`pickup.${key}`]}>
      <TextField value={pickup[key]} onChange={(event) => setPickup({ ...pickup, [key]: event.target.value })} />
    </FormField>
  );

  return (
    <section className={styles.panel} aria-labelledby="courier-title">
      <h2 id="courier-title" className={styles.panelTitle}>
        Courier prices (Shipbubble)
      </h2>
      <p className={styles.hint}>
        Addresses outside the zones above get a live courier price at checkout, so customers can pay straight away. If a courier can&apos;t price an order, our team prices
        it in Delivery prices.
      </p>
      {!settings.available ? (
        <Notice tone="warning">The Shipbubble key isn&apos;t set on the API yet, so courier prices are unavailable.</Notice>
      ) : null}
      {result ? (
        <Notice tone={result.tone} live>
          {result.text}
        </Notice>
      ) : null}
      <label className={styles.hint}>
        <input type="checkbox" checked={enabled} disabled={!settings.available} onChange={(event) => setEnabled(event.target.checked)} /> Use courier prices outside the zones
      </label>
      <FormField id="courier-rule" label="Which courier">
        <Select
          value={rule}
          onChange={(event) => setRule(event.target.value as CourierSettings["rule"])}
          options={[
            { value: "CHEAPEST", label: "Cheapest that collects from the workshop" },
            { value: "FASTEST", label: "Fastest that collects from the workshop" },
          ]}
        />
      </FormField>
      <FormField id="courier-category" label="What HolyPearls ships" error={errors.categoryId}>
        <Select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={[{ value: "", label: "Choose a package type" }, ...categories.map((category) => ({ value: String(category.id), label: category.name }))]}
        />
      </FormField>
      {field("name", "Pickup contact")}
      {field("phone", "Pickup phone")}
      {field("email", "Pickup email")}
      {field("address", "Pickup address", "Street, area, state and country, e.g. 12 Allen Avenue, Ikeja, Lagos, Nigeria")}
      <div>
        <Button type="button" loading={busy} onClick={() => void save()}>
          Save courier settings
        </Button>
      </div>
    </section>
  );
}
