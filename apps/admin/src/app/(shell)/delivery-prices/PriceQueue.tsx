"use client";

import { ApiError, type DeliveryPriceQueue } from "@holypearls/contracts";
import { Button, FormField, Notice, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { naira } from "@holypearls/web-kit/money";
import { useState } from "react";
import { z } from "zod";
import styles from "../admin-list.module.css";
import { ago, toKobo } from "../format";

type Item = DeliveryPriceQueue["items"][number];


/** One row per waiting checkout, each with its own price form. */
export function PriceQueue({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      {done ? (
        <Notice tone="success" live>
          {done}
        </Notice>
      ) : null}
      <table className={styles.table}>
        <caption className="hp-visually-hidden">Checkouts waiting for a delivery price, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">DELIVER TO</th>
            <th scope="col">ITEMS</th>
            <th scope="col">GOODS</th>
            <th scope="col">WAITING</th>
            <th scope="col">PRICE</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.checkoutId}>
              <td>
                {item.place}
                <span className={styles.hint}>
                  {" "}
                  · {item.zoneName} · {item.customer}
                </span>
                {item.courierProblem ? <span className={styles.hint}> · No courier price: {item.courierProblem}</span> : null}
              </td>
              <td>{item.items}</td>
              <td className={styles.mono}>{naira(item.goodsMinor)}</td>
              <td className={styles.mono}>{ago(item.requestedAt)}</td>
              <td>
                <PriceForm
                  item={item}
                  onPriced={(text) => {
                    setItems((all) => all.filter((other) => other.checkoutId !== item.checkoutId));
                    setDone(text);
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function PriceForm({ item, onPriced }: { item: Item; onPriced: (text: string) => void }) {
  const [rate, setRate] = useState("");
  const [min, setMin] = useState("2");
  const [max, setMax] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const rateMinor = toKobo(rate);
    if (rateMinor === null) return setError("Enter the price in naira, e.g. 9000");
    if (!/^\d+$/.test(min) || !/^\d+$/.test(max) || Number(max) < Number(min) || Number(min) < 1) return setError("Enter the delivery time in working days, shortest first");
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/admin/delivery-prices/${item.checkoutId}`, {
        method: "POST",
        body: { rateMinor, transitMinDays: Number(min), transitMaxDays: Number(max), version: item.version },
        response: z.object({ checkoutId: z.string(), version: z.number(), totalMinor: z.string() }),
      });
      onPriced(`Delivery to ${item.place} priced at ${naira(rateMinor)}. The customer has been emailed and can pay now.`);
    } catch (problem) {
      setError(problem instanceof ApiError ? (problem.body.code === "VERSION_CONFLICT" ? "The customer changed their checkout. Reload to see it." : problem.body.message) : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.panelActions}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <FormField id={`rate-${item.checkoutId}`} label="Price (₦, before VAT)" error={error ?? undefined}>
        <TextField inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />
      </FormField>
      <FormField id={`min-${item.checkoutId}`} label="Working days, from">
        <TextField inputMode="numeric" value={min} onChange={(event) => setMin(event.target.value)} />
      </FormField>
      <FormField id={`max-${item.checkoutId}`} label="to">
        <TextField inputMode="numeric" value={max} onChange={(event) => setMax(event.target.value)} />
      </FormField>
      <Button type="submit" loading={busy}>
        Set price
      </Button>
    </form>
  );
}
