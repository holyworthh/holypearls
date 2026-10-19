"use client";

import { ApiError, type GarmentData, garmentDataSchema } from "@holypearls/contracts";
import { Button, Checkbox, FormField, Notice, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useState } from "react";
import styles from "../admin-list.module.css";
import css from "../form-layout.module.css";

type Block = GarmentData["blocked"][number];
const METHODS = [
  ["EMBROIDERY", "Embroidery"],
  ["PRINT", "Print"],
] as const;
const POSITIONS = [
  ["LEFT_CHEST", "Left chest"],
  ["RIGHT_CHEST", "Right chest"],
  ["CENTRE_CHEST", "Centre chest"],
  ["FULL_FRONT", "Full front"],
  ["UPPER_BACK", "Upper back"],
  ["FULL_BACK", "Full back"],
  ["LEFT_SLEEVE", "Left sleeve"],
  ["RIGHT_SLEEVE", "Right sleeve"],
] as const;
const keyOf = (method: string, position: string) => `${method}:${position}`;

/**
 * Decorations and placements (OPS-FR-022; Pen 107 compatibility matrix): each
 * method on each placement is allowed unless unticked, with what the
 * customer is told. The configurator refuses a blocked one and offers the
 * other method.
 */
export function PlacementMatrix({ initial }: { initial: Block[] }) {
  const [blocked, setBlocked] = useState(() => new Map(initial.map((rule) => [keyOf(rule.method, rule.position), rule])));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const toggle = (method: Block["method"], position: Block["position"], allowed: boolean) => {
    const next = new Map(blocked);
    if (allowed) next.delete(keyOf(method, position));
    else next.set(keyOf(method, position), { method, position, message: `${METHODS.find(([key]) => key === method)![1]} isn't available on the ${POSITIONS.find(([key]) => key === position)![1].toLowerCase()}.` });
    setBlocked(next);
  };
  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api("/v1/admin/garment-data/placements", { method: "PUT", body: { blocked: [...blocked.values()] }, response: garmentDataSchema });
      setBlocked(new Map(saved.blocked.map((rule) => [keyOf(rule.method, rule.position), rule])));
      setNotice({ tone: "success", text: "Saved. The configurator checks these on the next change." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof ApiError ? (Object.values(error.body.fieldErrors ?? {})[0] ?? error.body.message) : "That didn't save. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="placements-title">
      <h2 id="placements-title" className={styles.panelTitle}>
        Decorations & placements (OPS-FR-022)
      </h2>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      <table className={styles.table}>
        <caption className="hp-visually-hidden">Which decoration methods each placement takes</caption>
        <thead>
          <tr>
            <th scope="col">PLACEMENT</th>
            {METHODS.map(([key, label]) => (
              <th key={key} scope="col">
                {label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {POSITIONS.map(([position, label]) => (
            <tr key={position}>
              <th scope="row">{label}</th>
              {METHODS.map(([method, methodLabel]) => (
                <td key={method}>
                  <Checkbox id={`allow-${method}-${position}`} label={`${methodLabel} on ${label.toLowerCase()}`} checked={!blocked.has(keyOf(method, position))} onChange={(event) => toggle(method, position, event.target.checked)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {[...blocked.values()].map((rule) => (
        <FormField key={keyOf(rule.method, rule.position)} id={`message-${rule.method}-${rule.position}`} label={`What the customer is told: ${METHODS.find(([key]) => key === rule.method)![1].toLowerCase()} on the ${POSITIONS.find(([key]) => key === rule.position)?.[1].toLowerCase()}`}>
          <TextField value={rule.message} onChange={(event) => setBlocked(new Map(blocked).set(keyOf(rule.method, rule.position), { ...rule, message: event.target.value }))} />
        </FormField>
      ))}
      <div className={css.actions}>
        <Button loading={busy} onClick={() => void save()}>
          Save placements
        </Button>
      </div>
    </section>
  );
}
