"use client";

import { type AdminShipment, type bookCourierSchema, adminShipmentSchema, ApiError, type OrderShipping, orderShippingSchema } from "@holypearls/contracts";
import { Button, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api, newIdempotencyKey } from "@holypearls/web-kit/api";
import { naira } from "@holypearls/web-kit/money";
import type { z } from "zod";
import { useState } from "react";
import list from "../../../admin-list.module.css";
import { formatTime } from "../../../format";
import styles from "../../../production/production.module.css";
import { SHIPMENT_TONE } from "../../tones";

type Result = { tone: "success" | "error"; title: string; body: string } | null;

/**
 * Create a shipment from ready items, then move each shipment along by hand
 * (Pen 115). "Ship now" can't exceed what is ready and not already shipped;
 * only the next statuses TECH-01 allows are offered; history is never erased.
 * A courier-priced order's shipment can be booked with Shipbubble instead
 * (T08-06); its webhooks then move the shipment on.
 */
export function OrderShipments({ initial }: { initial: OrderShipping }) {
  const [data, setData] = useState(initial);
  const [ship, setShip] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.items.filter((item) => item.shippable > 0).map((item) => [item.id, String(item.shippable)])),
  );
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [destination, setDestination] = useState(initial.destination);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());

  const reload = async () => setData(await api(`/v1/admin/shipments/orders/${data.orderId}`, { response: orderShippingSchema }));

  const create = async () => {
    const lines = Object.entries(ship)
      .map(([orderItemId, value]) => ({ orderItemId, quantity: Number(value) }))
      .filter((line) => line.quantity > 0);
    setBusy("create");
    setErrors({});
    setResult(null);
    try {
      const shipment = await api(`/v1/admin/shipments/orders/${data.orderId}`, {
        method: "POST",
        body: { items: lines, carrier, trackingNumber: tracking, destination },
        headers: { "idempotency-key": key },
        response: adminShipmentSchema,
      });
      setKey(newIdempotencyKey());
      setResult({
        tone: "success",
        title: "Shipment created",
        body: `${shipment.number} is PREPARING with ${shipment.items.length} item${shipment.items.length === 1 ? "" : "s"}. The customer is emailed when it's dispatched.`,
      });
      await reload();
      setShip({});
    } catch (problem) {
      if (problem instanceof ApiError && problem.body.fieldErrors) setErrors(problem.body.fieldErrors);
      else setResult({ tone: "error", title: "Shipment not created", body: problem instanceof ApiError ? problem.body.message : "Try again." });
    } finally {
      setBusy(null);
    }
  };

  const shippable = data.items.filter((item) => item.shippable > 0);
  return (
    <>
      <header className={styles.head}>
        <div className={list.head}>
          <p className={list.eyebrow}>
            ORDER {data.orderNumber} · {data.contactName.toUpperCase()}
          </p>
          <h1 className={list.title}>New shipment</h1>
          <p className={list.hint}>Destination: {data.destination || "not given at checkout"}</p>
        </div>
        <a className={styles.viewLink} href="/shipments">
          Back to shipments
        </a>
      </header>

      {result ? (
        <Notice tone={result.tone} title={result.title} live>
          {result.body}
        </Notice>
      ) : null}

      <section className={list.panel} aria-labelledby="create-title">
        <h2 id="create-title" className={list.panelTitle}>
          Create shipment
        </h2>
        <table className={list.table}>
          <caption className="hp-visually-hidden">Items and how many to ship now</caption>
          <thead>
            <tr>
              <th scope="col">ITEM</th>
              <th scope="col">READY</th>
              <th scope="col">ALREADY SHIPPED</th>
              <th scope="col">SHIP NOW</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.position} · {item.name}
                </td>
                <td className={list.mono}>
                  {item.status === "READY_TO_DISPATCH" ? `${(item.quantity - item.shipped).toLocaleString("en-NG")} of ${item.quantity.toLocaleString("en-NG")}` : "0"}
                </td>
                <td className={list.mono}>{item.shipped.toLocaleString("en-NG")}</td>
                <td>
                  {item.shippable > 0 ? (
                    <FormField id={`ship-${item.id}`} label={<span className="hp-visually-hidden">Ship now · {item.name}</span>} error={errors[`items.${item.id}`]}>
                      <TextField
                        inputMode="numeric"
                        value={ship[item.id] ?? ""}
                        onChange={(event) => setShip({ ...ship, [item.id]: event.target.value.replace(/\D/g, "").slice(0, 7) })}
                      />
                    </FormField>
                  ) : (
                    <span className={list.hint}>
                      {item.status === "READY_AWAITING_RELEASE" ? "Waiting for balance" : item.shipped >= item.quantity ? "All shipped" : "Not ready"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shippable.length ? (
          <>
            <div className={styles.row}>
              <FormField id="ship-carrier" label="Carrier" optional>
                <TextField value={carrier} maxLength={120} onChange={(event) => setCarrier(event.target.value)} />
              </FormField>
              <FormField id="ship-tracking" label="Tracking number" optional>
                <TextField value={tracking} maxLength={120} onChange={(event) => setTracking(event.target.value)} />
              </FormField>
            </div>
            <FormField id="ship-destination" label="Destination" error={errors.destination}>
              <TextField value={destination} maxLength={300} onChange={(event) => setDestination(event.target.value)} />
            </FormField>
            {errors.items ? <p className={list.hint}>{errors.items}</p> : null}
            <div>
              <Button type="button" loading={busy === "create"} onClick={() => void create()}>
                Create shipment
              </Button>
            </div>
          </>
        ) : (
          <p className={list.hint}>Nothing ready to ship. Items appear here when READY_TO_DISPATCH.</p>
        )}
      </section>

      <section className={list.panel} aria-labelledby="shipments-title">
        <h2 id="shipments-title" className={list.panelTitle}>
          Shipments for this order
        </h2>
        {data.shipments.length ? (
          data.shipments.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} onSaved={reload} onResult={setResult} />)
        ) : (
          <p className={list.hint}>No shipments yet.</p>
        )}
      </section>
    </>
  );
}

function ShipmentCard({ shipment, onSaved, onResult }: { shipment: AdminShipment; onSaved: () => Promise<void>; onResult: (result: Result) => void }) {
  const [next, setNext] = useState(shipment.next[0] ?? "");
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState(shipment.trackingNumber);
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookKey, setBookKey] = useState(() => newIdempotencyKey());
  const [outcome, setOutcome] = useState<"BOOKED" | "NOT_BOOKED">("BOOKED");
  const [existingOrderId, setExistingOrderId] = useState("");
  const [reconcileNote, setReconcileNote] = useState("");

  const book = async (reconciliation?: z.infer<typeof bookCourierSchema>["reconciliation"]) => {
    setBooking(true);
    try {
      const saved = await api(`/v1/admin/shipments/${shipment.id}/courier`, {
        method: "POST",
        body: { version: shipment.version, ...(reconciliation ? { reconciliation } : {}) },
        headers: { "idempotency-key": bookKey },
        response: adminShipmentSchema,
      });
      onResult({
        tone: "success",
        title: saved.courier ? "Courier booked" : "Booking reconciled",
        body: saved.courier
          ? `${saved.number} is booked with ${saved.carrier} for ${naira(saved.courier.costMinor)} before VAT. Its status now follows the courier.`
          : "The confirmed absence of a booking is recorded. You can book the courier now.",
      });
      setBookKey(newIdempotencyKey());
      await onSaved();
    } catch (problem) {
      onResult({
        tone: "error",
        title: "Courier booking needs checking",
        body:
          problem instanceof ApiError
            ? problem.body.code === "VERSION_CONFLICT"
              ? "Someone else updated this shipment. Reload and try again."
              : problem.body.message
            : "Reload and check the courier booking before trying again.",
      });
      await onSaved();
    } finally {
      setBooking(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api(`/v1/admin/shipments/${shipment.id}/status`, {
        method: "POST",
        body: { status: next, version: shipment.version, note: note || undefined, trackingNumber: tracking !== shipment.trackingNumber ? tracking : undefined },
        response: adminShipmentSchema,
      });
      onResult({ tone: "success", title: "Status saved", body: `${saved.number} is ${saved.status}.` });
      setNote("");
      await onSaved();
    } catch (problem) {
      onResult({
        tone: "error",
        title: "Status not changed",
        body:
          problem instanceof ApiError
            ? problem.body.code === "VERSION_CONFLICT"
              ? "Someone else updated this shipment. Reload and try again."
              : problem.body.message
            : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={list.panel} aria-label={shipment.number}>
      <div className={styles.titleRow}>
        <strong className={list.strong}>{shipment.number}</strong>
        <StatusChip tone={SHIPMENT_TONE[shipment.status] ?? "neutral"}>{shipment.status}</StatusChip>
        <span className={list.hint}>
          {shipment.items.map((item) => `${item.name} × ${item.quantity.toLocaleString("en-NG")}`).join(", ")} ·{" "}
          {[shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" · ") || "no carrier yet"}
        </span>
      </div>
      {shipment.courier ? (
        <p className={list.hint}>
          Shipbubble {shipment.courier.orderId} · {naira(shipment.courier.costMinor)} before VAT
          {shipment.courier.trackingUrl ? (
            <>
              {" · "}
              <a className={styles.viewLink} href={shipment.courier.trackingUrl} target="_blank" rel="noreferrer">
                Track parcel
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {shipment.bookingWarning ? (
        <Notice tone="warning" title="Check the courier booking">
          <p>{shipment.bookingWarning}</p>
        </Notice>
      ) : null}
      {shipment.bookingNeedsReconciliation ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void book({ outcome, ...(outcome === "BOOKED" ? { orderId: existingOrderId } : {}), note: reconcileNote });
          }}
        >
          <FormField id={`booking-outcome-${shipment.id}`} label="Result confirmed in Shipbubble">
            <Select
              value={outcome}
              onValueChange={(next) => setOutcome(next as typeof outcome)}
              options={[
                { value: "BOOKED", label: "An existing booking was found" },
                { value: "NOT_BOOKED", label: "Shipbubble confirmed no booking was made" },
              ]}
            />
          </FormField>
          {outcome === "BOOKED" ? (
            <FormField id={`booking-id-${shipment.id}`} label="Existing Shipbubble order ID">
              <TextField value={existingOrderId} required maxLength={200} onChange={(event) => setExistingOrderId(event.target.value)} />
            </FormField>
          ) : null}
          <FormField
            id={`booking-check-${shipment.id}`}
            label="How you confirmed the result"
            hint="Check the saved request token in Shipbubble or with their support. A missing response alone does not confirm a failed booking."
          >
            <TextField value={reconcileNote} required minLength={10} maxLength={1000} onChange={(event) => setReconcileNote(event.target.value)} />
          </FormField>
          <Button type="submit" loading={booking}>
            Record confirmed result
          </Button>
        </form>
      ) : null}
      {shipment.bookable ? (
        <div>
          <Button type="button" loading={booking} onClick={() => void book()}>
            {shipment.bookingWarning ? "Finish saving booking" : "Book courier"}
          </Button>
          <p className={list.hint}>Checks the courier&apos;s price again and books it for pickup on the next working day.</p>
        </div>
      ) : null}
      {shipment.next.length && !shipment.bookingWarning ? (
        <>
          <div className={styles.row}>
            <FormField id={`next-${shipment.id}`} label="New status" hint={`Only next statuses allowed from ${shipment.status} are offered.`}>
              <Select value={next} options={shipment.next.map((status) => ({ value: status, label: status }))} onValueChange={(chosen) => setNext(chosen as typeof next)} />
            </FormField>
            <FormField id={`tracking-${shipment.id}`} label="Tracking number" optional>
              <TextField value={tracking} maxLength={120} onChange={(event) => setTracking(event.target.value)} />
            </FormField>
          </div>
          <FormField id={`note-${shipment.id}`} label="Note (internal)" optional>
            <TextField value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
          </FormField>
          <div>
            <Button type="button" variant="secondary" loading={busy} onClick={() => void save()}>
              Save status
            </Button>
          </div>
        </>
      ) : null}
      <details>
        <summary className={list.hint}>History (never erased) · {shipment.history.length}</summary>
        <ol className={styles.history}>
          {shipment.history.map((event, index) => (
            <li key={`${event.at}-${index}`} className={styles.entry}>
              <div className={styles.entryText}>
                <p className={styles.entryAction}>{event.status}</p>
                {event.note ? <p className={list.hint}>{event.note}</p> : null}
                <p className={styles.entryBy}>
                  {event.by.toUpperCase()} · {formatTime(event.at).toUpperCase()}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
