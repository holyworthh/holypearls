"use client";

import { ApiError, type ProductionItem, type ProductionMove, productionItemSchema } from "@holypearls/contracts";
import { Button, FormField, Notice, Select, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { Check, Pause, Play } from "lucide-react";
import { useState } from "react";
import list from "../../../admin-list.module.css";
import { formatTime, money } from "../../../format";
import styles from "../../production.module.css";
import { ITEM_TONE } from "../../tones";

const MOVE_LABEL: Record<ProductionMove, string> = {
  QUEUE: "Move to QUEUED",
  START: "Start production (IN_PRODUCTION)",
  TO_QUALITY_CHECK: "Send to QUALITY_CHECK",
};

const REASONS = [
  { value: "CUSTOMER_INFORMATION", label: "Customer information needed" },
  { value: "ARTWORK", label: "Artwork problem" },
  { value: "MATERIALS", label: "Materials not available" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "PAYMENT", label: "Payment" },
  { value: "OTHER", label: "Other" },
] as const;

const NEEDS = { PROOF_APPROVAL: "proof approval", DEPOSIT: "deposit", ARTWORK: "artwork" } as const;

type Result = { tone: "success" | "error"; title: string; body: string } | null;

function problemText(problem: unknown, fallback: string) {
  if (!(problem instanceof ApiError)) return fallback;
  return problem.body.fieldErrors ? Object.values(problem.body.fieldErrors).join(" ") : problem.body.message;
}

/**
 * The item panel: prerequisites, the moves TECH-01 §4 allows from the current
 * status, the quality check result, holds with a customer preview, the
 * balance block, and history (Pen 113 item, 114 hold and balance).
 */
export function ItemPanel({ initial }: { initial: ProductionItem }) {
  const [item, setItem] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [outcome, setOutcome] = useState<"PASSED" | "REWORK">("PASSED");
  const [qcNote, setQcNote] = useState("");
  const [hold, setHold] = useState({ reason: "CUSTOMER_INFORMATION", internalNote: "", customerExplanation: "", whoActs: "CUSTOMER" as "CUSTOMER" | "HOLYPEARLS", days: "" });
  const [holdError, setHoldError] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);

  const label = `${item.orderNumber} item ${item.position}`;
  const open = item.hold?.status === "OPEN" ? item.hold : null;
  const shown = open ? "ON_HOLD" : item.status;

  async function run(key: string, call: () => Promise<ProductionItem>, success: (next: ProductionItem) => Result, onError?: (text: string) => void) {
    setBusy(key);
    setResult(null);
    try {
      const next = await call();
      setItem(next);
      setResult(success(next));
    } catch (problem) {
      if (problem instanceof ApiError && problem.body.code === "VERSION_CONFLICT") {
        const latest = productionItemSchema.safeParse((problem.body.context as { latest?: unknown } | undefined)?.latest);
        if (latest.success) setItem(latest.data);
        setResult({ tone: "error", title: "Status not changed", body: "Someone else updated this item. The latest is shown; check it and try again." });
      } else if (onError) {
        onError(problemText(problem, "We couldn't save that. Try again."));
      } else {
        setResult({ tone: "error", title: "Status not changed", body: problemText(problem, "We couldn't save that. Try again.") });
      }
    } finally {
      setBusy(null);
    }
  }

  const post = (path: string, body: object) => api(`/v1/admin/production/items/${item.id}${path}`, { method: "POST", body, response: productionItemSchema });

  const move = (name: ProductionMove) => run(name, () => post("/moves", { move: name, version: item.version }), (next) => ({ tone: "success", title: "Status changed", body: `${label} is ${next.status}. Order summary: ${next.orderSummary}.` }));

  const saveQc = () =>
    run(
      "qc",
      () => post("/qc", { outcome, note: qcNote, version: item.version }),
      (next) =>
        outcome === "PASSED"
          ? { tone: "success", title: "QC passed", body: `Item ${item.position} is ${next.status}. Order summary recalculated: ${next.orderSummary}.` }
          : { tone: "success", title: "Sent for rework", body: `Item ${item.position} sent back to IN_PRODUCTION for rework. Note saved in history.` },
    ).then(() => setQcNote(""));

  const placeHold = () => {
    if (!hold.customerExplanation.trim()) {
      setHoldError("Add an explanation for the customer. It's shown on their order page.");
      return;
    }
    setHoldError(null);
    void run(
      "hold",
      () => post("/hold", { reason: hold.reason, internalNote: hold.internalNote, customerExplanation: hold.customerExplanation, whoActs: hold.whoActs, timingImpactDays: hold.days.trim() ? Number(hold.days) : null }),
      () => ({ tone: "success", title: "Hold placed", body: `${label} shows ON_HOLD and keeps its status ${item.status}. Customer emailed.` }),
      setHoldError,
    );
  };

  const resolve = () => {
    if (!resolution.trim()) {
      setResolveError("Say how the hold was resolved.");
      return;
    }
    setResolveError(null);
    void run(
      "resolve",
      () => post("/hold/resolve", { resolution }),
      (next) => ({ tone: "success", title: "Hold resolved", body: `${label} no longer shows ON_HOLD and continues ${next.status}. Customer emailed.` }),
      setResolveError,
    ).then(() => setResolution(""));
  };

  const prereq = item.prerequisites;
  const prereqLine = [
    prereq.proof.status === "NOT_REQUIRED" ? "No proof needed" : `Proof${prereq.proof.versionNumber ? ` V${prereq.proof.versionNumber}` : ""} ${prereq.proof.status}`,
    prereq.deposit === "NOT_NEEDED" ? null : prereq.deposit === "PAID" ? "deposit paid" : "deposit due",
    prereq.artwork === "NONE" ? null : `artwork ${prereq.artwork}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const days = hold.days.trim() ? Number(hold.days) : null;

  return (
    <>
      <header className={styles.head}>
        <div className={list.head}>
          <p className={list.eyebrow}>
            ORDER {item.orderNumber} · ITEM {item.position} OF {item.itemCount} · ORDER SHOWS {item.orderSummary}
          </p>
          <h1 className={list.title}>
            {item.productName} × {item.quantity.toLocaleString("en-NG")}
          </h1>
          <div className={styles.titleRow}>
            <StatusChip tone={ITEM_TONE[shown] ?? "neutral"}>{shown}</StatusChip>
            {open ? <span className={list.hint}>Underlying status {item.status}</span> : null}
            <span className={list.hint}>{prereqLine}</span>
          </div>
        </div>
        <a className={styles.viewLink} href="/production">
          Back to board
        </a>
      </header>

      {result ? (
        <Notice tone={result.tone} title={result.title} live>
          {result.body}
        </Notice>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.main}>
          {item.balance && item.status === "READY_AWAITING_RELEASE" ? (
            <section className={list.panel} aria-labelledby="balance-title">
              <h2 id="balance-title" className={list.panelTitle}>
                Dispatch blocked by balance
              </h2>
              <p className={list.hint}>
                {item.balance.label} {money(item.balance.amountMinor, item.balance.currency)} is {item.balance.status === "DUE" ? "BALANCE_DUE" : item.balance.status}. Dispatch is blocked (OPS-FR-064). Paying it moves finished items to READY_TO_DISPATCH in the same transaction. There is no manual release.
              </p>
            </section>
          ) : null}

          {item.canRecordQc ? (
            <section className={list.panel} aria-labelledby="qc-title">
              <h2 id="qc-title" className={list.panelTitle}>
                Quality check result (OPS-FR-063)
              </h2>
              <fieldset className={styles.radios}>
                <legend className="hp-visually-hidden">Result</legend>
                <label className={styles.radio}>
                  <input type="radio" name="qc" checked={outcome === "PASSED"} onChange={() => setOutcome("PASSED")} />
                  Passed — release (READY_TO_DISPATCH, or READY_AWAITING_RELEASE if a balance is due)
                </label>
                <label className={styles.radio}>
                  <input type="radio" name="qc" checked={outcome === "REWORK"} onChange={() => setOutcome("REWORK")} />
                  Send for rework (back to IN_PRODUCTION)
                </label>
              </fieldset>
              <FormField id="qc-note" label="QC note" optional>
                <TextArea rows={2} maxLength={1000} value={qcNote} onChange={(event) => setQcNote(event.target.value)} />
              </FormField>
              <div>
                <Button type="button" loading={busy === "qc"} onClick={() => void saveQc()}>
                  Save QC result
                </Button>
              </div>
            </section>
          ) : null}

          <section className={list.panel} aria-labelledby="moves-title">
            <h2 id="moves-title" className={list.panelTitle}>
              Allowed next steps from {item.status}
            </h2>
            {open ? (
              <p className={list.hint}>The item is on hold. Resolve the hold before moving it.</p>
            ) : item.moves.length ? (
              <div className={list.panelActions}>
                {item.moves.map((name) => (
                  <Button key={name} type="button" variant={name === "QUEUE" ? "secondary" : "primary"} loading={busy === name} onClick={() => void move(name)} icon={name === "START" ? <Play size={16} aria-hidden="true" /> : undefined}>
                    {MOVE_LABEL[name]}
                  </Button>
                ))}
              </div>
            ) : (
              <p className={list.hint}>
                {item.status === "QUALITY_CHECK"
                  ? "Record the quality check result above: pass (ready) or rework."
                  : item.status === "READY_AWAITING_RELEASE"
                    ? "Released automatically when the balance is paid."
                    : item.status === "READY_TO_DISPATCH"
                      ? "Ready for a shipment."
                      : "No production steps from here."}
              </p>
            )}
            {item.status === "AWAITING_PREREQUISITE" && prereq.missing.length ? <p className={list.hint}>Needs: {prereq.missing.map((need) => NEEDS[need]).join(", ")}. The item is queued automatically when these are met.</p> : null}
            <p className={list.hint}>Only moves allowed by TECH-01 §4 are offered. Cancelling after commitment is a separate high-risk action (T07-03).</p>
          </section>

          {open ? (
            <section className={list.panel} aria-labelledby="hold-title">
              <h2 id="hold-title" className={list.panelTitle}>
                On hold: {REASONS.find((reason) => reason.value === open.reason)?.label ?? open.reason}
              </h2>
              <dl className={list.fields}>
                <dt>Internal note</dt>
                <dd>{open.internalNote || "—"}</dd>
                <dt>Customer sees</dt>
                <dd>{open.customerExplanation}</dd>
                <dt>Who needs to act</dt>
                <dd>{open.whoActs === "CUSTOMER" ? "Customer" : "HolyPearls"}</dd>
                <dt>Timing impact</dt>
                <dd>{open.timingImpactDays ? `+${open.timingImpactDays} working days` : "None stated"}</dd>
                <dt>Placed</dt>
                <dd>
                  {open.placedBy ?? "Staff"} · {formatTime(open.createdAt)}
                </dd>
              </dl>
              <FormField id="resolution" label="How was it resolved?" error={resolveError ?? undefined}>
                <TextArea rows={2} maxLength={1000} value={resolution} onChange={(event) => setResolution(event.target.value)} />
              </FormField>
              <div>
                <Button type="button" loading={busy === "resolve"} onClick={resolve} icon={<Check size={16} aria-hidden="true" />}>
                  Resolve hold and notify customer
                </Button>
              </div>
            </section>
          ) : ["DISPATCHED", "DELIVERED", "CANCELLED"].includes(item.status) ? null : (
            <section className={list.panel} aria-labelledby="place-title">
              <h2 id="place-title" className={list.panelTitle}>
                Hold details (OPS-FR-062)
              </h2>
              <p className={list.hint}>A hold pauses the item without changing its production status.</p>
              <FormField id="hold-reason" label="Reason category" hint="Category list to be confirmed by the owner.">
                <Select value={hold.reason} options={REASONS.map((reason) => ({ ...reason }))} onChange={(event) => setHold({ ...hold, reason: event.target.value })} />
              </FormField>
              <FormField id="hold-internal" label="Internal note (staff only)" optional>
                <TextArea rows={2} maxLength={2000} value={hold.internalNote} onChange={(event) => setHold({ ...hold, internalNote: event.target.value })} />
              </FormField>
              <FormField id="hold-explanation" label="Explanation shown to customer" error={holdError ?? undefined}>
                <TextArea rows={2} maxLength={500} value={hold.customerExplanation} onChange={(event) => setHold({ ...hold, customerExplanation: event.target.value })} />
              </FormField>
              <div className={styles.row}>
                <FormField id="hold-who" label="Who needs to act">
                  <Select
                    value={hold.whoActs}
                    options={[
                      { value: "CUSTOMER", label: "Customer" },
                      { value: "HOLYPEARLS", label: "HolyPearls" },
                    ]}
                    onChange={(event) => setHold({ ...hold, whoActs: event.target.value as "CUSTOMER" | "HOLYPEARLS" })}
                  />
                </FormField>
                <FormField id="hold-days" label="Timing impact (working days)" optional>
                  <TextField inputMode="numeric" value={hold.days} onChange={(event) => setHold({ ...hold, days: event.target.value.replace(/\D/g, "").slice(0, 3) })} />
                </FormField>
              </div>
              <div className={styles.preview} aria-label="Customer will see">
                <p className={list.eyebrow}>CUSTOMER WILL SEE</p>
                <StatusChip tone="error">ON_HOLD</StatusChip>
                <p className={list.notice}>{hold.customerExplanation.trim() || "Your explanation appears here."}</p>
                <p className={list.hint}>
                  {hold.whoActs === "CUSTOMER" ? "Your action needed" : "We're working on it"}
                  {days ? ` · may add ${days} working day${days === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <div>
                <Button type="button" variant="secondary" loading={busy === "hold"} onClick={placeHold} icon={<Pause size={16} aria-hidden="true" />}>
                  Place hold and notify customer
                </Button>
              </div>
            </section>
          )}
        </div>

        <aside className={styles.side}>
          <section className={list.panel} aria-labelledby="history-title">
            <h2 id="history-title" className={list.panelTitle}>
              Item history
            </h2>
            {item.history.length ? (
              <ol className={styles.history}>
                {item.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className={styles.entry}>
                    <span className={styles.marker} aria-hidden="true">
                      <Check size={14} />
                    </span>
                    <div className={styles.entryText}>
                      <p className={styles.entryAction}>
                        {entry.kind === "HOLD_PLACED" ? "Hold placed" : entry.kind === "HOLD_RESOLVED" ? "Hold resolved" : `Moved to ${entry.to}`}
                      </p>
                      {entry.note || entry.from ? <p className={list.hint}>{entry.note ?? `From ${entry.from}`}</p> : null}
                      <p className={styles.entryBy}>
                        {entry.by.toUpperCase()} · {formatTime(entry.at).toUpperCase()}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={list.hint}>No changes yet.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
