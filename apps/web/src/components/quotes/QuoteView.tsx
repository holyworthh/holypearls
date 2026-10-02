"use client";

import { ApiError, CHANGE_TYPES, type CustomerQuote, customerQuoteSchema, TRIGGER_LABEL } from "@holypearls/contracts";
import { Button, Checkbox, Dialog, FormField, Notice, Select, StatusChip, TextArea } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { api, newIdempotencyKey } from "../../lib/api";
import { naira } from "../../lib/money";
import { useEmailCode } from "../EmailCode";
import s from "./quote.module.css";

/*
 * The customer's quote (Pen 25 · nPbFB desktop, 46 · r8lGW mobile, 47 · i3MiU
 * expired; QUOTE-FR-002–008). Accepting needs the review tick and, if the
 * customer hasn't checked one in the last 24 hours, an email code; the order
 * opens next. Request changes, ask a question and decline are dialogs.
 */

const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

const STATUS_TEXT: Record<string, { label: string; tone: "warning" | "success" | "info" | "neutral" }> = {
  READY: { label: "ready for your decision", tone: "warning" },
  REVISION_REQUESTED: { label: "being revised", tone: "info" },
  ACCEPTED: { label: "accepted", tone: "success" },
  DECLINED: { label: "declined", tone: "neutral" },
  EXPIRED: { label: "expired", tone: "warning" },
  PENDING_REVIEW: { label: "being prepared", tone: "info" },
};

type Dialogs = "change" | "question" | "decline" | null;

export function QuoteView({ initial }: { initial: CustomerQuote }) {
  const router = useRouter();
  const [quote, setQuote] = useState(initial);
  const [ticked, setTicked] = useState(false);
  const [tickError, setTickError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [key] = useState(() => newIdempotencyKey());
  const code = useEmailCode("ACCEPT_QUOTE");
  const version = quote.version;
  const status = STATUS_TEXT[quote.status] ?? STATUS_TEXT.READY!;
  const expired = quote.status === "EXPIRED";
  const deposit = version?.payments?.[0];

  const accept = async () => {
    if (!version) return;
    if (!ticked) {
      setTickError("Tick the box to confirm you've reviewed the quote.");
      return;
    }
    setTickError(null);
    setFailure(null);
    setBusy(true);
    try {
      const order = await code.run(() =>
        api(`/v1/quotes/${quote.id}/accept`, { method: "POST", headers: { "idempotency-key": key }, body: { versionNumber: version.number, acknowledged: true }, response: z.object({ id: z.string(), number: z.string() }) }),
      );
      if (order) router.push(`/orders/${order.id}`);
    } catch (problem) {
      setFailure(problem instanceof ApiError ? problem.body.message : "We couldn't accept the quote. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const renew = async () => {
    setBusy(true);
    try {
      setQuote(await api(`/v1/quotes/${quote.id}/request-update`, { method: "POST", response: customerQuoteSchema }));
      setSent("We'll send you an updated quote. Your project and history are kept.");
    } catch (problem) {
      setFailure(problem instanceof ApiError ? problem.body.message : "We couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={s.head}>
        <p className={s.crumb}>{quote.projectReference ? `PROJECT ${quote.projectReference} / QUOTE` : "QUOTE"}</p>
        <div className={s.headRow}>
          <div className={s.headText}>
            <h1 className={s.h1}>{quote.title}</h1>
            <div className={s.chips}>
              <StatusChip tone={status.tone}>{version ? `Quote V${version.number} · ${status.label}` : `Quote ${status.label}`}</StatusChip>
              <span className={s.mono}>
                {quote.reference}
                {version ? ` · VERSION ${version.number}` : ""}
                {version?.validUntil ? ` · VALID UNTIL ${day(version.validUntil).toUpperCase()}` : ""}
              </span>
            </div>
          </div>
          {!expired && quote.status !== "DECLINED" ? (
            <button type="button" className={s.contact} onClick={() => setDialog("question")}>
              <span className={s.avatar} aria-hidden="true">
                HP
              </span>
              <span>
                <span className={s.strong}>Your HolyPearls contact</span>
                <span className={s.muted}>Ask a question on this quote</span>
              </span>
            </button>
          ) : null}
        </div>
        {quote.versions.length ? (
          <ol className={s.versions} aria-label="Versions">
            {quote.versions.map((item) => (
              <li key={item.number} aria-current={item.number === version?.number ? "true" : undefined}>
                V{item.number} · {item.number === version?.number ? "current" : item.status.toLowerCase()}
                {item.sentAt ? ` · ${new Date(item.sentAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : ""}
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {expired ? (
        <div className={s.expired} role="status">
          <p className={s.strong}>This quote expired on {version?.validUntil ? day(version.validUntil) : "its valid-until date"}</p>
          <button type="button" className={s.outline} onClick={() => void renew()} disabled={busy}>
            Request updated quote
          </button>
        </div>
      ) : null}

      {!version ? (
        <div className={s.body}>
          <Notice tone="info" title="Your quote is being prepared">
            <p>We&apos;re reviewing your brief. You&apos;ll get an email with a link as soon as the quote is ready.</p>
          </Notice>
        </div>
      ) : (
        <div className={s.body}>
          <div className={s.document}>
            {sent ? (
              <Notice tone="success" title="Sent" live>
                <p>{sent}</p>
              </Notice>
            ) : null}
            {quote.changes.length ? (
              <section className={s.changed} aria-labelledby="changed-title">
                <h2 id="changed-title" className={s.changedTitle}>
                  What changed from V{version.number - 1}
                </h2>
                <p className={s.changedBody}>{quote.changes.join(" · ")}.</p>
              </section>
            ) : null}

            <section className={s.lines} aria-labelledby="lines-title">
              <div className={s.linesHead}>
                <h2 id="lines-title" className={s.h2}>
                  What&apos;s included
                </h2>
                <span className={s.mono}>{version.lines.length} LINES</span>
              </div>
              {version.lines.map((line) => (
                <div key={line.id} className={s.line}>
                  <span className={s.thumb} aria-hidden="true" />
                  <span>
                    <span className={s.item}>{line.title}</span>
                    <span className={s.spec}>
                      {line.quantity.toLocaleString("en-NG")} {line.quantity === 1 ? "unit" : "units"}
                      {line.summary ? ` · ${line.summary}` : ""}
                    </span>
                  </span>
                  <span className={s.price}>
                    <span className={s.lineTotal}>{naira(line.totalMinor)}</span>
                    <span className={s.muted}>≈ {naira(line.unitMinor)} each</span>
                  </span>
                </div>
              ))}
              {[
                { label: "Design / artwork preparation", value: version.fees.designMinor, note: "one-time" },
                { label: "Delivery", value: version.fees.deliveryMinor, note: version.fees.deliveryNote },
                { label: "Installation", value: version.fees.installationMinor, note: version.fees.installationNote },
                { label: version.fees.otherLabel || "Other", value: version.fees.otherMinor, note: "" },
              ]
                .filter((fee) => fee.value !== "0")
                .map((fee) => (
                  <div key={fee.label} className={s.line}>
                    <span className={s.thumb} aria-hidden="true" />
                    <span>
                      <span className={s.item}>{fee.label}</span>
                      {fee.note ? <span className={s.spec}>{fee.note}</span> : null}
                    </span>
                    <span className={s.price}>
                      <span className={s.lineTotal}>{naira(fee.value)}</span>
                    </span>
                  </div>
                ))}
              <div className={s.line}>
                <span className={s.thumb} aria-hidden="true" />
                <span className={s.item}>VAT {version.totals.vatRateBps / 100}%</span>
                <span className={s.price}>
                  <span className={s.lineTotal}>{naira(version.totals.vatMinor)}</span>
                </span>
              </div>
            </section>

            <section className={s.after} aria-labelledby="after-title">
              <h2 id="after-title" className={s.h2}>
                What happens after you accept
              </h2>
              <ol className={s.plan}>
                {[
                  { title: "Accept + deposit", note: deposit ? `${deposit.label} ${naira(deposit.amountMinor)} ${TRIGGER_LABEL[deposit.trigger].toLowerCase()}` : "Payment as scheduled" },
                  { title: "Proofs", note: "Before production" },
                  { title: "Production + QC", note: "Item by item" },
                  ...(version.payments ?? []).slice(1).map((payment) => ({ title: payment.label, note: `${naira(payment.amountMinor)} ${TRIGGER_LABEL[payment.trigger].toLowerCase()}` })),
                  { title: "Delivery", note: version.fees.installationMinor !== "0" ? "With installation" : "To you" },
                ].map((step) => (
                  <li key={step.title}>
                    <span className={s.planBar} aria-hidden="true">
                      <span className={s.planDot} />
                      <span className={s.planLine} />
                    </span>
                    <span className={s.planTitle}>{step.title}</span>
                    <span className={s.muted}>{step.note}</span>
                  </li>
                ))}
              </ol>
            </section>

            <dl className={s.terms}>
              <div>
                <dt>Payment terms · {(version.payments ?? []).map((payment) => `${payment.percentBps !== null ? `${payment.percentBps / 100}% ` : ""}${payment.label.toLowerCase()} ${TRIGGER_LABEL[payment.trigger].toLowerCase()}`).join(", ")}</dt>
              </div>
              {version.terms ? (
                <div>
                  <dt>Terms</dt>
                  <dd>{version.terms}</dd>
                </div>
              ) : null}
              {version.assumptions ? (
                <div>
                  <dt>Assumptions</dt>
                  <dd>{version.assumptions}</dd>
                </div>
              ) : null}
              {version.productionSequence ? (
                <div>
                  <dt>Expected production sequence</dt>
                  <dd>{version.productionSequence}</dd>
                </div>
              ) : null}
            </dl>

            {quote.requests.length ? (
              <section aria-labelledby="requests-title">
                <h2 id="requests-title" className={s.h2}>
                  Your messages about this quote
                </h2>
                <ul className={s.requests}>
                  {quote.requests.map((request) => (
                    <li key={`${request.createdAt}-${request.kind}`}>
                      <strong>{{ CHANGE: "Change requested", QUESTION: "Question", DECLINE: "Declined", UPDATE: "Updated quote requested" }[request.kind]}</strong>
                      {request.line ? ` · ${request.line}` : ""} · {day(request.createdAt)}
                      {request.note ? <span className={s.muted}>{request.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className={s.rail} aria-label="Your decision">
            <dl className={s.summary}>
              <div>
                <dt>Quote total</dt>
                <dd className={s.total}>{naira(version.totals.totalMinor)}</dd>
              </div>
              {(version.payments ?? []).map((payment) => (
                <div key={payment.label}>
                  <dt>
                    {payment.label} {TRIGGER_LABEL[payment.trigger].toLowerCase()}
                    {payment.percentBps !== null ? ` (${payment.percentBps / 100}%)` : ""}
                  </dt>
                  <dd>{naira(payment.amountMinor)}</dd>
                </div>
              ))}
            </dl>
            {version.validUntil ? <p className={s.validity}>{expired ? "Expired" : "Valid until"} {day(version.validUntil)}</p> : null}

            {quote.order ? (
              <section className={s.decision} aria-labelledby="accepted-title">
                <h2 id="accepted-title" className={s.decisionTitle}>
                  Quote accepted
                </h2>
                <p className={s.muted}>Your order is {quote.order.number}.</p>
                <a className={s.outline} href={`/orders/${quote.order.id}`}>
                  View your order and pay
                </a>
              </section>
            ) : (
              <section className={s.decision} aria-labelledby="decision-title">
                <h2 id="decision-title" className={s.decisionTitle}>
                  Ready to go ahead?
                </h2>
                {quote.canAccept ? (
                  <Checkbox
                    id="accept-ack"
                    label="I have reviewed the scope, pricing and production terms in this quote."
                    checked={ticked}
                    onChange={(event) => setTicked(event.target.checked)}
                    hint={tickError ?? undefined}
                  />
                ) : null}
                <button type="button" className={s.accept} onClick={() => void accept()} disabled={!quote.canAccept || busy}>
                  {busy ? "Accepting…" : `Accept Quote V${version.number}`}
                </button>
                {quote.blockers.length ? (
                  <p className={s.muted} role="status">
                    {quote.blockers[0]!.message}
                  </p>
                ) : deposit ? (
                  <p className={s.muted}>
                    Accepting confirms the terms. Next, you&apos;ll pay the {naira(deposit.amountMinor)} {deposit.label.toLowerCase()}. Nothing is charged yet.
                  </p>
                ) : null}
                {failure ? (
                  <Notice tone="error" title="Not accepted" live>
                    <p>{failure}</p>
                  </Notice>
                ) : null}
                {quote.status === "READY" || quote.status === "REVISION_REQUESTED" ? (
                  <div className={s.secondary}>
                    <button type="button" className={s.outline} onClick={() => setDialog("change")}>
                      Request changes
                    </button>
                    <button type="button" className={s.link} onClick={() => setDialog("decline")}>
                      Decline
                    </button>
                  </div>
                ) : null}
                {expired ? (
                  <button type="button" className={s.outline} onClick={() => void renew()} disabled={busy}>
                    Request updated quote
                  </button>
                ) : null}
              </section>
            )}
          </aside>
        </div>
      )}

      <RequestDialog quote={quote} kind={dialog} onClose={() => setDialog(null)} onSent={(next, message) => (setQuote(next), setSent(message), setDialog(null))} />
      {code.dialog}
    </>
  );
}

function RequestDialog({ quote, kind, onClose, onSent }: { quote: CustomerQuote; kind: Dialogs; onClose: () => void; onSent: (quote: CustomerQuote, message: string) => void }) {
  const [note, setNote] = useState("");
  const [lineId, setLineId] = useState("");
  const [changeType, setChangeType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = kind === "change" ? "Request changes" : kind === "question" ? "Ask a question" : "Decline this quote";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (kind !== "decline" && !note.trim()) {
      setError(kind === "change" ? "Tell us what you'd like changed." : "Type your question.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next =
        kind === "decline"
          ? await api(`/v1/quotes/${quote.id}/decline`, { method: "POST", body: { reason: note.trim() || undefined }, response: customerQuoteSchema })
          : await api(`/v1/quotes/${quote.id}/requests`, {
              method: "POST",
              body: { kind: kind === "change" ? "CHANGE" : "QUESTION", note: note.trim(), lineId: lineId || null, changeType: changeType || null },
              response: customerQuoteSchema,
            });
      setNote("");
      onSent(next, kind === "change" ? "Thanks. We'll revise the quote and email you the new version." : kind === "question" ? "Thanks. We'll reply by email." : "You declined this quote. Thanks for letting us know.");
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.body.message : "We couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={kind !== null}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="quote-request" loading={busy} variant={kind === "decline" ? "destructive" : "primary"}>
            {kind === "decline" ? "Decline quote" : "Send"}
          </Button>
        </>
      }
    >
      <form id="quote-request" className={s.dialogForm} onSubmit={submit} noValidate>
        {kind === "change" && quote.version ? (
          <>
            <FormField id="request-line" label="Which line?" optional>
              <Select
                value={lineId}
                options={[{ value: "", label: "The whole quote" }, ...quote.version.lines.map((line) => ({ value: line.id, label: line.title }))]}
                onChange={(event) => setLineId(event.target.value)}
              />
            </FormField>
            <FormField id="request-type" label="What kind of change?" optional>
              <Select value={changeType} options={[{ value: "", label: "Choose one" }, ...CHANGE_TYPES.map((type) => ({ value: type, label: type }))]} onChange={(event) => setChangeType(event.target.value)} />
            </FormField>
          </>
        ) : null}
        <FormField
          id="request-note"
          label={kind === "change" ? "What would you like changed?" : kind === "question" ? "Your question" : "Why are you declining? (optional)"}
          error={error ?? undefined}
        >
          <TextArea rows={4} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} />
        </FormField>
        {kind === "decline" ? <p className={s.muted}>Declining closes this quote. You can always start a new project.</p> : null}
      </form>
    </Dialog>
  );
}
