"use client";

import {
  type AdminQuote,
  adminQuoteSchema,
  ApiError,
  type InstallmentTrigger,
  type QuoteLineInput,
  type QuoteVersion,
  quoteVersionSchema,
  type ScheduleEntry,
  TRIGGER_LABEL,
} from "@holypearls/contracts";
import { Button, Dialog, EmptyState, FormField, Notice, Select, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { api, errorCode, newIdempotencyKey } from "@holypearls/web-kit/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../admin-list.module.css";
import { formatTime, money } from "../../format";
import { QUOTE_TONE } from "../tones";

/*
 * Quote builder and version editor (Pen 111 · p8eBI; OPS-FR-031–034, 040,
 * QUOTE-FR-001). Staff edit a DRAFT; the server works out every total. A
 * SENT version is read only. Sending asks for confirmation, then the
 * customer gets the quote's secure link.
 */

/** "10,100.50" (major units) → "1010050"; null when it isn't a price. */
function toMinor(value: string): string | null {
  const clean = value.replaceAll(",", "").trim();
  if (!clean) return "0";
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

const toMajor = (minor: string) => {
  const value = BigInt(minor);
  const fraction = value % 100n;
  return `${value / 100n}${fraction ? `.${fraction.toString().padStart(2, "0")}` : ""}`;
};

type Draft = {
  currency: "NGN" | "USD";
  lines: (Omit<QuoteLineInput, "unitMinor"> & { unit: string; key: string })[];
  fees: { design: string; delivery: string; deliveryNote: string; installation: string; installationNote: string; other: string; otherLabel: string };
  validDays: string;
  terms: string;
  assumptions: string;
  productionSequence: string;
  schedule: (ScheduleEntry & { key: string; percent: string })[];
};

const toDraft = (version: QuoteVersion): Draft => ({
  currency: version.currency,
  lines: version.lines.map((line) => ({ ...line, key: line.id, unit: toMajor(line.unitMinor) })),
  fees: {
    design: toMajor(version.fees.designMinor),
    delivery: toMajor(version.fees.deliveryMinor),
    deliveryNote: version.fees.deliveryNote,
    installation: toMajor(version.fees.installationMinor),
    installationNote: version.fees.installationNote,
    other: toMajor(version.fees.otherMinor),
    otherLabel: version.fees.otherLabel,
  },
  validDays: String(version.validDays),
  terms: version.terms,
  assumptions: version.assumptions,
  productionSequence: version.productionSequence,
  schedule: version.schedule.map((entry, index) => ({ ...entry, key: `${index}-${entry.label}`, percent: entry.kind === "PERCENT" ? String(Number(entry.value) / 100) : toMajor(entry.value) })),
});

const TRIGGERS = Object.entries(TRIGGER_LABEL) as [InstallmentTrigger, string][];

export function QuoteBuilder({ initial, selected }: { initial: AdminQuote; selected: number | null }) {
  const router = useRouter();
  const [quote, setQuote] = useState(initial);
  const pick = (from: AdminQuote) => from.versions.find((version) => version.number === selected) ?? from.versions.find((version) => version.status === "DRAFT") ?? from.versions[0] ?? null;
  const [current, setCurrent] = useState<QuoteVersion | null>(() => pick(initial));
  const [draft, setDraft] = useState<Draft | null>(() => (current?.status === "DRAFT" ? toDraft(current) : null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sendKey, setSendKey] = useState(() => newIdempotencyKey());

  const open = (version: QuoteVersion | null) => {
    setCurrent(version);
    setDraft(version?.status === "DRAFT" ? toDraft(version) : null);
    setErrors({});
    setFailure(null);
    setDirty(false);
  };

  const change = (update: (draft: Draft) => Draft) => {
    setDirty(true);
    setNotice(null);
    setDraft((value) => (value ? update(value) : value));
  };

  const fail = (problem: unknown, fallback: string) => {
    if (problem instanceof ApiError && problem.body.fieldErrors) {
      setErrors(problem.body.fieldErrors);
      setFailure("Some things need fixing. They're marked below.");
    } else if (errorCode(problem) === "VERSION_CONFLICT") setFailure("Someone else saved this version first. Reload to see their changes.");
    else if (errorCode(problem) === "CONFLICT" && problem instanceof ApiError) setFailure(problem.body.message);
    else setFailure(fallback);
  };

  const body = (value: Draft, version: number) => {
    const local: Record<string, string> = {};
    const lines = value.lines.map((line, index) => {
      const unitMinor = toMinor(line.unit);
      if (unitMinor === null) local[`lines.${index}.unitMinor`] = "Enter a price like 10100 or 10100.50.";
      return { source: line.source, sourceKey: line.sourceKey, title: line.title, summary: line.summary, quantity: line.quantity, unitMinor: unitMinor ?? "0" };
    });
    const fee = (key: string, raw: string) => {
      const minor = toMinor(raw);
      if (minor === null) local[`fees.${key}`] = "Enter an amount like 25000.";
      return minor ?? "0";
    };
    const schedule = value.schedule.map(({ key: _key, percent, ...entry }, index) => {
      void _key;
      const amount = entry.kind === "PERCENT" ? Math.round(Number(percent) * 100) : toMinor(percent);
      if (amount === null || (typeof amount === "number" && !Number.isFinite(amount))) local[`schedule.${index}`] = "Enter a number.";
      return { ...entry, value: String(amount ?? 0), dueDate: entry.trigger === "ON_DATE" ? entry.dueDate || null : null };
    });
    return {
      local,
      payload: {
        version,
        currency: value.currency,
        lines,
        fees: { designMinor: fee("designMinor", value.fees.design), deliveryMinor: fee("deliveryMinor", value.fees.delivery), deliveryNote: value.fees.deliveryNote, installationMinor: fee("installationMinor", value.fees.installation), installationNote: value.fees.installationNote, otherMinor: fee("otherMinor", value.fees.other), otherLabel: value.fees.otherLabel },
        validDays: Number(value.validDays) || 0,
        terms: value.terms,
        assumptions: value.assumptions,
        productionSequence: value.productionSequence,
        schedule,
      },
    };
  };

  /** Saves the draft; returns the saved version, or null if it didn't save. */
  const save = async (): Promise<QuoteVersion | null> => {
    if (!draft || !current) return null;
    const { local, payload } = body(draft, current.version);
    if (Object.keys(local).length) {
      setErrors(local);
      setFailure("Some things need fixing. They're marked below.");
      return null;
    }
    setBusy(true);
    setErrors({});
    setFailure(null);
    try {
      const saved = await api(`/v1/admin/quotes/${quote.id}/versions/${current.id}`, { method: "PUT", body: payload, response: quoteVersionSchema });
      setCurrent(saved);
      setQuote((value) => ({ ...value, versions: value.versions.map((version) => (version.id === saved.id ? saved : version)) }));
      setDraft(toDraft(saved));
      setDirty(false);
      setNotice("Draft saved. Totals are worked out by the server.");
      return saved;
    } catch (problem) {
      fail(problem, "We couldn't save the draft. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const newVersion = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const next = await api(`/v1/admin/quotes/${quote.id}/versions`, { method: "POST", response: adminQuoteSchema });
      setQuote(next);
      open(next.versions.find((version) => version.status === "DRAFT") ?? null);
    } catch (problem) {
      fail(problem, "We couldn't start a new version. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const saved = dirty ? await save() : current;
    if (!saved) {
      setConfirming(false);
      return;
    }
    setBusy(true);
    try {
      const next = await api(`/v1/admin/quotes/${quote.id}/versions/${saved.id}/send`, { method: "POST", body: { version: saved.version }, headers: { "idempotency-key": sendKey }, response: adminQuoteSchema });
      setQuote(next);
      open(next.versions.find((version) => version.id === saved.id) ?? null);
      setNotice(`V${saved.number} sent. ${next.versions.some((version) => version.status === "SUPERSEDED" && version.number === saved.number - 1) ? `V${saved.number - 1} is now SUPERSEDED. ` : ""}Quote is READY; the customer sees it from their secure link.`);
      setSendKey(newIdempotencyKey());
      router.refresh();
    } catch (problem) {
      fail(problem, "We couldn't send the quote. Try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const addCandidate = (index: number) => {
    const candidate = quote.candidates[index];
    if (!candidate) return;
    change((value) => ({
      ...value,
      lines: [...value.lines, { key: crypto.randomUUID(), source: candidate.source, sourceKey: candidate.sourceKey, title: candidate.title, summary: candidate.summary, quantity: candidate.quantity ?? 1, unit: candidate.unitMinor ? toMajor(candidate.unitMinor) : "" }],
    }));
  };

  const live = current?.status === "DRAFT" && draft ? draft : null;
  const latestSent = quote.versions.find((version) => version.status === "SENT");
  const lineTotal = (line: Draft["lines"][number]) => {
    const unit = toMinor(line.unit);
    return unit === null ? "—" : money((BigInt(unit) * BigInt(line.quantity)).toString(), live?.currency ?? "NGN");
  };

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>
          QUOTE {quote.reference} · {quote.source.kind === "PROJECT" ? `PROJECT ${quote.source.reference} · ` : "CONFIGURATION · "}
          {quote.source.title.toUpperCase()}
        </p>
        <h1 className={styles.title}>{current ? `Version ${current.number}${current.status === "DRAFT" ? " (draft)" : ""}` : "No version yet"}</h1>
        <div className={styles.chips}>
          {current ? <StatusChip tone={current.status === "DRAFT" ? "neutral" : current.status === "SENT" ? "success" : "warning"}>{current.status}</StatusChip> : null}
          <span className={styles.hint}>
            Quote status <StatusChip tone={QUOTE_TONE[quote.status] ?? "neutral"}>{quote.status}</StatusChip>
            {latestSent ? ` · V${latestSent.number} sent ${formatTime(latestSent.sentAt!)}` : ""} · {quote.contact.name ? `${quote.contact.name}, ` : ""}
            {quote.contact.email}
          </span>
        </div>
      </header>

      <div className={styles.filters}>
        <nav className={styles.tabs} aria-label="Versions">
          {quote.versions.map((version) => (
            <a
              key={version.id}
              className={styles.tab}
              href={`/quotes/${quote.id}?v=${version.number}`}
              aria-current={version.id === current?.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                open(version);
                window.history.replaceState(null, "", `/quotes/${quote.id}?v=${version.number}`);
              }}
            >
              V{version.number} · {version.status}
              {version.status !== "DRAFT" ? " (read-only)" : ""}
            </a>
          ))}
        </nav>
        <span className={styles.spacer} />
        {quote.source.kind === "PROJECT" ? (
          <a className={styles.action} href={`/projects?id=${quote.source.id}`}>
            Open project
          </a>
        ) : null}
        {!quote.versions.some((version) => version.status === "DRAFT") && !["ACCEPTED", "DECLINED"].includes(quote.status) ? (
          <Button type="button" variant="secondary" loading={busy && !live} onClick={newVersion}>
            {quote.versions.length ? `New version (V${quote.versions[0]!.number + 1})` : "Start quote (V1)"}
          </Button>
        ) : null}
        {live ? (
          <>
            <Button type="button" variant="secondary" loading={busy && !confirming} onClick={() => void save()}>
              Save draft
            </Button>
            <Button type="button" onClick={() => setConfirming(true)}>
              Send V{current!.number}
            </Button>
          </>
        ) : null}
      </div>

      {notice ? (
        <Notice tone="success" title="Done" live>
          <p>{notice}</p>
        </Notice>
      ) : null}
      {failure ? (
        <Notice tone="error" title="Not saved" live>
          <p>{failure}</p>
          {Object.entries(errors).length ? (
            <ul>
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      {quote.requests.length ? (
        <section className={styles.panel} aria-labelledby="customer-requests">
          <h2 id="customer-requests" className={styles.panelTitle}>
            From the customer ({quote.requests.length})
          </h2>
          <ul className={styles.plainList}>
            {quote.requests.map((request) => (
              <li key={`${request.createdAt}-${request.kind}`}>
                <strong>{{ CHANGE: "Change requested", QUESTION: "Question", DECLINE: "Declined", UPDATE: "Updated quote requested" }[request.kind] ?? request.kind}</strong>
                {request.version ? ` on V${request.version}` : ""}
                {request.line ? ` · ${request.line}` : ""}
                {request.changeType ? ` · ${request.changeType}` : ""} · {formatTime(request.createdAt)}
                {request.note ? <span className={styles.hint}> · {request.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!current ? (
        <EmptyState title="No line items yet" body="Start a version, then add lines from the project's items or configurations." />
      ) : current.status !== "DRAFT" ? (
        <ReadOnly version={current} />
      ) : live ? (
        <div className={styles.columns}>
          <div className={styles.tableCol}>
            {live.lines.length ? (
              <table className={styles.table}>
                <caption className="hp-visually-hidden">Lines of version {current.number}</caption>
                <thead>
                  <tr>
                    <th scope="col">ITEM</th>
                    <th scope="col">CONFIGURATION</th>
                    <th scope="col">QTY</th>
                    <th scope="col">UNIT ({live.currency})</th>
                    <th scope="col">TOTAL</th>
                    <th scope="col">
                      <span className="hp-visually-hidden">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {live.lines.map((line, index) => (
                    <tr key={line.key}>
                      <td>
                        <TextField aria-label={`Line ${index + 1} item`} value={line.title} maxLength={160} onChange={(event) => change((value) => ({ ...value, lines: value.lines.map((item, at) => (at === index ? { ...item, title: event.target.value } : item)) }))} />
                      </td>
                      <td>
                        <TextField aria-label={`Line ${index + 1} configuration`} value={line.summary} maxLength={600} onChange={(event) => change((value) => ({ ...value, lines: value.lines.map((item, at) => (at === index ? { ...item, summary: event.target.value } : item)) }))} />
                      </td>
                      <td>
                        <TextField
                          aria-label={`Line ${index + 1} quantity`}
                          inputMode="numeric"
                          value={String(line.quantity)}
                          onChange={(event) => change((value) => ({ ...value, lines: value.lines.map((item, at) => (at === index ? { ...item, quantity: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1) } : item)) }))}
                        />
                      </td>
                      <td>
                        <TextField
                          aria-label={`Line ${index + 1} unit price`}
                          inputMode="decimal"
                          value={line.unit}
                          aria-invalid={errors[`lines.${index}.unitMinor`] ? true : undefined}
                          onChange={(event) => change((value) => ({ ...value, lines: value.lines.map((item, at) => (at === index ? { ...item, unit: event.target.value } : item)) }))}
                        />
                      </td>
                      <td className={styles.mono}>{lineTotal(line)}</td>
                      <td>
                        <button type="button" className={styles.action} onClick={() => change((value) => ({ ...value, lines: value.lines.filter((_, at) => at !== index) }))}>
                          Remove<span className="hp-visually-hidden"> line {index + 1}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No line items yet" body="Add lines from the project's items or configurations." />
            )}
            <div className={styles.filters}>
              <label className={styles.select}>
                <span className="hp-visually-hidden">Add line from project item</span>
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value === "manual") change((value) => ({ ...value, lines: [...value.lines, { key: crypto.randomUUID(), source: "MANUAL", sourceKey: null, title: "", summary: "", quantity: 1, unit: "" }] }));
                    else if (event.target.value) addCandidate(Number(event.target.value));
                  }}
                >
                  <option value="">Add line from project item…</option>
                  {quote.candidates.map((candidate, index) => (
                    <option key={`${candidate.source}-${candidate.sourceKey}`} value={index}>
                      {candidate.title}
                      {candidate.quantity ? ` × ${candidate.quantity}` : ""}
                    </option>
                  ))}
                  <option value="manual">A new line of your own</option>
                </select>
              </label>
            </div>

            <section className={styles.panel} aria-labelledby="fees-title">
              <h2 id="fees-title" className={styles.panelTitle}>
                Fees, delivery and terms
              </h2>
              <div className={styles.filters}>
                <FormField id="fee-design" label="Design fee" error={errors["fees.designMinor"]}>
                  <TextField inputMode="decimal" value={live.fees.design} onChange={(event) => change((value) => ({ ...value, fees: { ...value.fees, design: event.target.value } }))} />
                </FormField>
                <FormField id="fee-delivery" label="Delivery" error={errors["fees.deliveryMinor"]}>
                  <TextField inputMode="decimal" value={live.fees.delivery} onChange={(event) => change((value) => ({ ...value, fees: { ...value.fees, delivery: event.target.value } }))} />
                </FormField>
                <FormField id="fee-delivery-note" label="Delivery note" optional>
                  <TextField value={live.fees.deliveryNote} maxLength={160} onChange={(event) => change((value) => ({ ...value, fees: { ...value.fees, deliveryNote: event.target.value } }))} />
                </FormField>
              </div>
              <div className={styles.filters}>
                <FormField id="fee-installation" label="Installation" error={errors["fees.installationMinor"]}>
                  <TextField inputMode="decimal" value={live.fees.installation} onChange={(event) => change((value) => ({ ...value, fees: { ...value.fees, installation: event.target.value } }))} />
                </FormField>
                <FormField id="fee-installation-note" label="Installation note" optional>
                  <TextField value={live.fees.installationNote} maxLength={160} onChange={(event) => change((value) => ({ ...value, fees: { ...value.fees, installationNote: event.target.value } }))} />
                </FormField>
                <FormField id="fee-other" label="Other fee" error={errors["fees.otherMinor"]} optional>
                  <TextField inputMode="decimal" value={live.fees.other} onChange={(event) => change((value) => ({ ...value, fees: { ...value.fees, other: event.target.value } }))} />
                </FormField>
              </div>
              <div className={styles.filters}>
                <FormField id="quote-currency" label="Currency" hint={quote.usdEnabled ? undefined : "USD needs USD quotes switched on in Payment settings."} error={errors.currency}>
                  <Select
                    value={live.currency}
                    options={[
                      { value: "NGN", label: "NGN" },
                      { value: "USD", label: "USD", disabled: !quote.usdEnabled },
                    ]}
                    onChange={(event) => change((value) => ({ ...value, currency: event.target.value as "NGN" | "USD" }))}
                  />
                </FormField>
                <FormField id="quote-valid" label="Valid for (days after sending)" error={errors.validDays}>
                  <TextField inputMode="numeric" value={live.validDays} onChange={(event) => change((value) => ({ ...value, validDays: event.target.value.replace(/\D/g, "") }))} />
                </FormField>
              </div>
              <FormField id="quote-terms" label="Terms shown to customer">
                <TextArea rows={3} value={live.terms} maxLength={4000} onChange={(event) => change((value) => ({ ...value, terms: event.target.value }))} />
              </FormField>
              <FormField id="quote-assumptions" label="Assumptions" optional>
                <TextArea rows={2} value={live.assumptions} maxLength={4000} onChange={(event) => change((value) => ({ ...value, assumptions: event.target.value }))} />
              </FormField>
              <FormField id="quote-sequence" label="Expected production sequence" optional>
                <TextArea rows={2} value={live.productionSequence} maxLength={2000} onChange={(event) => change((value) => ({ ...value, productionSequence: event.target.value }))} />
              </FormField>
            </section>
          </div>

          <aside className={styles.detailCol} aria-label="Totals and payment schedule">
            <Totals version={current} dirty={dirty} />
            <section className={styles.panel} aria-labelledby="schedule-title">
              <h2 id="schedule-title" className={styles.panelTitle}>
                Payment schedule
              </h2>
              {live.schedule.map((entry, index) => (
                <fieldset key={entry.key} className={styles.panel}>
                  <legend className="hp-visually-hidden">Payment {index + 1}</legend>
                  <div className={styles.filters}>
                    <TextField aria-label={`Payment ${index + 1} name`} value={entry.label} maxLength={60} onChange={(event) => change((value) => ({ ...value, schedule: value.schedule.map((item, at) => (at === index ? { ...item, label: event.target.value } : item)) }))} />
                    <Select
                      aria-label={`Payment ${index + 1} kind`}
                      value={entry.kind}
                      options={[
                        { value: "PERCENT", label: "% of total" },
                        { value: "AMOUNT", label: "Fixed amount" },
                      ]}
                      onChange={(event) => change((value) => ({ ...value, schedule: value.schedule.map((item, at) => (at === index ? { ...item, kind: event.target.value as "PERCENT" | "AMOUNT" } : item)) }))}
                    />
                    <TextField aria-label={`Payment ${index + 1} ${entry.kind === "PERCENT" ? "percentage" : "amount"}`} inputMode="decimal" value={entry.percent} onChange={(event) => change((value) => ({ ...value, schedule: value.schedule.map((item, at) => (at === index ? { ...item, percent: event.target.value } : item)) }))} />
                  </div>
                  <div className={styles.filters}>
                    <Select
                      aria-label={`Payment ${index + 1} due`}
                      value={entry.trigger}
                      options={TRIGGERS.map(([trigger, label]) => ({ value: trigger, label }))}
                      onChange={(event) => change((value) => ({ ...value, schedule: value.schedule.map((item, at) => (at === index ? { ...item, trigger: event.target.value as InstallmentTrigger } : item)) }))}
                    />
                    {entry.trigger === "ON_DATE" ? (
                      <TextField aria-label={`Payment ${index + 1} date`} type="date" value={entry.dueDate ?? ""} onChange={(event) => change((value) => ({ ...value, schedule: value.schedule.map((item, at) => (at === index ? { ...item, dueDate: event.target.value } : item)) }))} />
                    ) : null}
                    {live.schedule.length > 1 ? (
                      <button type="button" className={styles.action} onClick={() => change((value) => ({ ...value, schedule: value.schedule.filter((_, at) => at !== index) }))}>
                        Remove<span className="hp-visually-hidden"> payment {index + 1}</span>
                      </button>
                    ) : null}
                  </div>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={live.schedule.length >= 8}
                onClick={() => change((value) => ({ ...value, schedule: [...value.schedule, { key: crypto.randomUUID(), label: `Milestone ${value.schedule.length + 1}`, kind: "PERCENT", value: "0", percent: "0", trigger: "BEFORE_PRODUCTION", dueDate: null }] }))}
              >
                Add milestone
              </Button>
              <p className={styles.hint}>Starts from the admin default. Percentages must total 100% (fixed amounts count towards the total).</p>
              {errors.schedule || current.scheduleProblem ? (
                <p className={styles.hint} role="alert">
                  {errors.schedule ?? current.scheduleProblem}
                </p>
              ) : null}
              {current.payments && !dirty ? (
                <ul className={styles.plainList}>
                  {current.payments.map((payment) => (
                    <li key={payment.label}>
                      <strong>{payment.label}</strong> · {money(payment.amountMinor, current.currency)} · {TRIGGER_LABEL[payment.trigger]}
                      {payment.dueDate ? ` ${payment.dueDate}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Send V${current?.number ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void send()} loading={busy}>
              Send V{current?.number}
            </Button>
          </>
        }
      >
        <p>
          Send V{current?.number} to {quote.contact.email}?{latestSent ? ` V${latestSent.number} becomes SUPERSEDED and can't be accepted any more.` : ""} A sent version can&apos;t change.
        </p>
      </Dialog>
    </>
  );
}

function Totals({ version, dirty }: { version: QuoteVersion; dirty: boolean }) {
  const { totals, currency } = version;
  return (
    <section className={styles.panel} aria-labelledby="totals-title">
      <h2 id="totals-title" className={styles.panelTitle}>
        Totals
      </h2>
      {dirty ? <p className={styles.hint}>Save the draft to update the totals.</p> : null}
      <dl className={styles.fields}>
        <dt>Items</dt>
        <dd className={styles.mono}>{money(totals.goodsMinor, currency)}</dd>
        <dt>Fees + delivery + install</dt>
        <dd className={styles.mono}>{money(totals.feesMinor, currency)}</dd>
        <dt>VAT {totals.vatRateBps / 100}%</dt>
        <dd className={styles.mono}>{money(totals.vatMinor, currency)}</dd>
        <dt>Total</dt>
        <dd className={styles.mono}>
          <strong>{money(totals.totalMinor, currency)}</strong>
        </dd>
      </dl>
    </section>
  );
}

/** A sent (or superseded, accepted, declined, expired) version: read only (Pen 111 "SENT VERSION · READ-ONLY"). */
function ReadOnly({ version }: { version: QuoteVersion }) {
  return (
    <div className={styles.columns}>
      <div className={styles.tableCol}>
        <Notice tone="info" title={`V${version.number} · ${version.status}`}>
          <p>
            V{version.number} was sent {version.sentAt ? formatTime(version.sentAt) : ""}
            {version.sentBy ? ` by ${version.sentBy}` : ""} and can&apos;t change. Create a new version to revise.
            {version.validUntil ? ` Valid until ${formatTime(version.validUntil)}.` : ""}
          </p>
        </Notice>
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Lines of version {version.number}</caption>
          <thead>
            <tr>
              <th scope="col">ITEM</th>
              <th scope="col">CONFIGURATION</th>
              <th scope="col">QTY</th>
              <th scope="col">UNIT</th>
              <th scope="col">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {version.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <strong className={styles.strong}>{line.title}</strong>
                </td>
                <td className={styles.hint}>{line.summary}</td>
                <td>{line.quantity.toLocaleString("en-NG")}</td>
                <td className={styles.mono}>{money(line.unitMinor, version.currency)}</td>
                <td className={styles.mono}>{money(line.totalMinor, version.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {version.terms ? (
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Terms shown to customer</h2>
            <p>{version.terms}</p>
          </section>
        ) : null}
      </div>
      <aside className={styles.detailCol} aria-label="Totals and payment schedule">
        <Totals version={version} dirty={false} />
        <section className={styles.panel} aria-labelledby="schedule-title">
          <h2 id="schedule-title" className={styles.panelTitle}>
            Payment schedule
          </h2>
          <ul className={styles.plainList}>
            {(version.payments ?? []).map((payment) => (
              <li key={payment.label}>
                <strong>{payment.label}</strong> · {payment.percentBps !== null ? `${payment.percentBps / 100}% · ` : ""}
                {money(payment.amountMinor, version.currency)} · {TRIGGER_LABEL[payment.trigger]}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
