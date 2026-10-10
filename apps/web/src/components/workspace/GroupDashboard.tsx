"use client";

import { type Collection, type CollectionDashboard, collectionDashboardSchema, type CollectionParticipant, GARMENT_SIZES } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, Select, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason } from "@holypearls/web-kit/api";
import { useState } from "react";
import { z } from "zod";
import { PARTICIPANT_STATUS } from "./labels";
import styles from "./workspace.module.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
type Filter = "ALL" | "NOT_STARTED" | "INCOMPLETE" | "COMPLETE" | "REMOVED";
const FILTERS: [Filter, string][] = [
  ["ALL", "All"],
  ["NOT_STARTED", "Not started"],
  ["INCOMPLETE", "Incomplete"],
  ["COMPLETE", "Complete"],
  ["REMOVED", "Removed"],
];
const matches = (filter: Filter, row: CollectionParticipant) =>
  filter === "ALL"
    ? row.status !== "REMOVED"
    : filter === "NOT_STARTED"
      ? row.status === "NOT_STARTED"
      : filter === "INCOMPLETE"
        ? row.status === "IN_PROGRESS" || row.status === "NEEDS_CORRECTION"
        : filter === "COMPLETE"
          ? row.status === "SUBMITTED"
          : row.status === "REMOVED";

const MESSAGES: Record<string, string> = {
  NOT_OPEN: "That's only while the collection is open.",
  NOT_SUBMITTED: "They haven't sent their answers yet.",
  NOT_REVIEWING: "Rows are left out during review, after the collection closes.",
  WRONG_STATUS: "This collection can't do that now. Reload the page.",
  REMOVED: "This person was removed.",
};

/**
 * The organizer's dashboard (Pen 30 · qig8v desktop, 74 · hnmBe 375; 133
 * close and review; 134 removing a participant): one number that matters,
 * the issues to fix, live size and delivery counts, then everyone's answers.
 */
export function GroupDashboard({ organizationId, collection, initial }: { organizationId: string; collection: Collection; initial: CollectionDashboard }) {
  const [board, setBoard] = useState(initial);
  const [status, setStatus] = useState(collection.status);
  const [version, setVersion] = useState(collection.version);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "close" } | { kind: "reopen" } | { kind: "remove"; row: CollectionParticipant } | { kind: "correction"; row: CollectionParticipant } | null>(null);
  const [note, setNote] = useState("");
  const [deadline, setDeadline] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const base = `/v1/organizations/${organizationId}/collections/${collection.id}`;
  const canManage = collection.canManage;
  const reviewing = status === "CLOSED" || status === "NEEDS_REVIEW" || status === "READY_TO_ORDER";
  const waiting = board.participants.filter((row) => row.status !== "REMOVED" && !row.excluded && row.status !== "SUBMITTED").length;

  /** The collection's status and version move with each action; read them back after it. */
  const refreshCollection = async () => {
    const current = await api(base, { response: z.object({ status: z.string(), version: z.number().int() }) });
    setStatus(current.status as typeof status);
    setVersion(current.version);
  };
  const run = async (name: string, call: () => Promise<CollectionDashboard | void>, done: string) => {
    setBusy(name);
    setNotice(null);
    setFieldError(undefined);
    try {
      const next = await call();
      if (next) setBoard(next);
      await refreshCollection();
      setNotice({ tone: "success", text: done });
      setDialog(null);
      setNote("");
    } catch (error) {
      if (error instanceof Error && "body" in error && (error as { body: { fieldErrors?: Record<string, string> } }).body.fieldErrors) setFieldError(Object.values((error as { body: { fieldErrors: Record<string, string> } }).body.fieldErrors)[0]);
      else setNotice({ tone: "error", text: errorCode(error) === "VERSION_CONFLICT" ? "Someone else changed this. Reload the page." : (MESSAGES[errorReason(error) ?? ""] ?? "That didn't work. Try again.") });
    } finally {
      setBusy(null);
    }
  };
  const act = (row: CollectionParticipant, action: string, body: Record<string, unknown>, done: string) =>
    run(`${action}-${row.id}`, () => api(`${base}/participants/${row.id}/${action}`, { method: "POST", body: { ...body, version: row.version }, response: collectionDashboardSchema }), done);

  const statusLine =
    status === "OPEN"
      ? `Open${collection.deadline ? ` · closes ${day(collection.deadline)}` : ""}`
      : status === "PAUSED"
        ? "Paused · participants can't submit"
        : status === "NEEDS_REVIEW"
          ? "Closed · needs review"
          : status === "READY_TO_ORDER"
            ? "Closed · ready to order"
            : status === "CLOSED"
              ? "Closed"
              : status.replace(/_/g, " ").toLowerCase();

  return (
    <>
      <div className={styles.head}>
        <div>
          <p className={styles.rowMeta}>{statusLine}</p>
          <p className={styles.rowMeta}>
            {collection.source.label} · {collection.locationName} · each person&apos;s answers are private
          </p>
        </div>
        {canManage ? (
          <div className={styles.quickActions}>
            {status === "OPEN" && waiting ? (
              <Button variant="secondary" loading={busy === "remind"} onClick={() => void run("remind", async () => void (await api(`${base}/remind`, { method: "POST", response: z.object({ reminded: z.number() }) })), `Reminder sent to ${waiting} ${waiting === 1 ? "person" : "people"}.`)}>
                Remind {waiting} {waiting === 1 ? "person" : "people"}
              </Button>
            ) : null}
            {status === "OPEN" || status === "PAUSED" ? <Button onClick={() => setDialog({ kind: "close" })}>Close collection</Button> : null}
            {reviewing ? (
              <Button variant="secondary" onClick={() => setDialog({ kind: "reopen" })}>
                Reopen
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      {status === "NEEDS_REVIEW" ? (
        <Notice tone="warning" title="Needs review">
          <p>
            {board.issues.length} {board.issues.length === 1 ? "row needs" : "rows need"} attention. Fix them or leave the rows out of the order. Closing doesn&apos;t start production.
          </p>
        </Notice>
      ) : null}
      {status === "READY_TO_ORDER" ? (
        <Notice tone="success" title="Ready to order">
          <p>Everyone in the order has answered. The Order Draft comes next; nothing is made until it&apos;s submitted.</p>
        </Notice>
      ) : null}

      <div className={styles.groupTop}>
        <section className={styles.detail} aria-label="Progress">
          <p className={styles.groupNumber}>
            {board.progress.submitted}
            <span className={styles.rowMeta}> / {board.progress.total} submitted</span>
          </p>
          <div className={styles.rowChips}>
            <StatusChip tone="success">{board.progress.submitted} complete</StatusChip>
            <StatusChip tone="warning">{board.progress.incomplete} incomplete</StatusChip>
            <StatusChip tone="neutral">{board.progress.notStarted} not started</StatusChip>
            {board.progress.removed ? <StatusChip tone="neutral">{board.progress.removed} removed</StatusChip> : null}
          </div>
          {board.lastRemindedAt ? <p className={styles.rowMeta}>Last reminder {day(board.lastRemindedAt)}</p> : null}
        </section>
        <section className={styles.detail} aria-labelledby="sizes-title">
          <h2 id="sizes-title" className={styles.detailTitle}>
            Sizes and delivery so far
          </h2>
          {board.sizes.length || board.sizesToConfirm ? (
            <table className={styles.sizeTable}>
              <caption className="hp-visually-hidden">Pieces by size, from complete answers</caption>
              <thead>
                <tr>
                  {GARMENT_SIZES.filter((size) => board.sizes.some((item) => item.size === size)).map((size) => (
                    <th key={size} scope="col">
                      {size}
                    </th>
                  ))}
                  {board.sizesToConfirm ? <th scope="col">To confirm</th> : null}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {GARMENT_SIZES.filter((size) => board.sizes.some((item) => item.size === size)).map((size) => (
                    <td key={size}>{board.sizes.find((item) => item.size === size)?.count}</td>
                  ))}
                  {board.sizesToConfirm ? <td>{board.sizesToConfirm}</td> : null}
                  <td>{board.pieces}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className={styles.rowMeta}>{board.pieces} pieces so far</p>
          )}
          <p className={styles.rowMeta}>
            Delivery · {board.delivery.map((item) => `${item.name} ${item.count}`).join(" · ")}
            {board.withNames ? ` · ${board.withNames} with names` : ""}
          </p>
          <p className={styles.eyebrow}>Counts are live · not an order until closed and reviewed</p>
        </section>
      </div>

      {board.issues.length ? (
        <section className={styles.detail} aria-labelledby="issues-title">
          <h2 id="issues-title" className={styles.detailTitle}>
            {board.issues.length} {board.issues.length === 1 ? "issue" : "issues"}
          </h2>
          {board.issues.map((issue) => {
            const row = board.participants.find((item) => item.id === issue.participantId)!;
            return (
              <div key={issue.participantId} className={styles.detailRow}>
                <div className={styles.detailText}>
                  <span className={styles.detailLabel}>{issue.name}</span>
                  <span className={styles.detailValue}>{issue.message}</span>
                </div>
                {canManage && issue.kind === "SIZE_TO_CONFIRM" ? (
                  <Select aria-label={`Confirm ${issue.name}'s size`} value="" onChange={(event) => void act(row, "settle-size", { size: event.target.value }, `${issue.name}'s size is ${event.target.value}.`)} options={[{ value: "", label: "Confirm size" }, ...GARMENT_SIZES.map((size) => ({ value: size, label: size }))]} />
                ) : null}
                {canManage && reviewing ? (
                  <Button variant="tertiary" loading={busy === `exclude-${row.id}`} onClick={() => void act(row, "exclude", {}, `${issue.name} is left out of the order.`)}>
                    Leave out
                  </Button>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      <section className={styles.panel} aria-labelledby="participants-title">
        <div className={styles.panelHead}>
          <h2 id="participants-title" className={styles.panelTitle}>
            Participants
          </h2>
        </div>
        <nav className={styles.filters} aria-label="Participant filters">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={styles.filter} aria-current={filter === value ? "page" : undefined} onClick={() => setFilter(value)}>
              {label} {board.participants.filter((row) => matches(value, row)).length}
            </button>
          ))}
        </nav>
        {board.participants.filter((row) => matches(filter, row)).length ? (
          <ul className={styles.rows}>
            {board.participants
              .filter((row) => matches(filter, row))
              .map((row) => {
                const chip = PARTICIPANT_STATUS[row.status];
                return (
                  <li key={row.id} className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.rowTitle}>{row.name}</span>
                      <span className={styles.rowMeta}>
                        {[row.size ?? (row.sizeUnsure ? "Size to confirm" : null), row.personalization ? `“${row.personalization}”` : null, row.branchName, row.status === "REMOVED" && row.removedAt ? `Removed ${day(row.removedAt)}` : null, row.excluded ? "Left out of the order" : null].filter(Boolean).join(" · ") || row.email}
                      </span>
                    </div>
                    <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                    {canManage && row.status !== "REMOVED" ? (
                      <div className={styles.rowActions}>
                        {status === "OPEN" && row.status === "SUBMITTED" ? (
                          <button type="button" className={styles.textButton} onClick={() => setDialog({ kind: "correction", row })}>
                            Ask to correct<span className="hp-visually-hidden"> {row.name}</span>
                          </button>
                        ) : null}
                        {reviewing && row.excluded ? (
                          <button type="button" className={styles.textButton} onClick={() => void act(row, "include", {}, `${row.name} is back in the order.`)}>
                            Put back<span className="hp-visually-hidden"> {row.name}</span>
                          </button>
                        ) : null}
                        <button type="button" className={styles.textButton} onClick={() => setDialog({ kind: "remove", row })}>
                          Remove<span className="hp-visually-hidden"> {row.name}</span>
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        ) : (
          <p className={styles.emptyRow}>{board.participants.length ? "Nobody here." : "No answers yet. Share the link with everyone taking part."}</p>
        )}
      </section>

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog?.kind === "close"
            ? "Close now?"
            : dialog?.kind === "reopen"
              ? "Reopen the collection?"
              : dialog?.kind === "remove"
                ? `Remove ${dialog.row.name}?`
                : dialog?.kind === "correction"
                  ? `Ask ${dialog.row.name} to correct`
                  : ""
        }
        footer={
          dialog ? (
            <>
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              {dialog.kind === "close" ? (
                <Button loading={busy === "close"} onClick={() => void run("close", () => api(`${base}/close`, { method: "POST", body: { version }, response: collectionDashboardSchema }), "Closed. Review the rows that need attention; nothing is made yet.")}>
                  Close collection
                </Button>
              ) : null}
              {dialog.kind === "reopen" ? (
                <Button
                  loading={busy === "reopen"}
                  onClick={() => void run("reopen", () => api(`${base}/reopen`, { method: "POST", body: { deadline: deadline ? new Date(deadline).toISOString() : "", version }, response: collectionDashboardSchema }), "Reopened. Participants can send and change answers until the new deadline.")}
                >
                  Reopen
                </Button>
              ) : null}
              {dialog.kind === "remove" ? (
                <Button variant="destructive" loading={busy === `remove-${dialog.row.id}`} onClick={() => void act(dialog.row, "remove", {}, `${dialog.row.name} was removed.`)}>
                  Remove
                </Button>
              ) : null}
              {dialog.kind === "correction" ? (
                <Button loading={busy === `correction-${dialog.row.id}`} onClick={() => void act(dialog.row, "correction", { note }, `We've emailed ${dialog.row.name} to correct their answers.`)}>
                  Send
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {dialog?.kind === "close" ? (
          <p className={styles.dialogText}>
            {waiting ? `${waiting} ${waiting === 1 ? "person hasn't" : "people haven't"} submitted. ` : ""}Closing doesn&apos;t start production. You review the answers, then make the Order Draft.
          </p>
        ) : null}
        {dialog?.kind === "reopen" ? (
          <div className={styles.form}>
            <p className={styles.dialogText}>Participants can send and change answers again until the new deadline.</p>
            <FormField id="reopen-deadline" label="New deadline" error={fieldError}>
              <TextField type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            </FormField>
          </div>
        ) : null}
        {dialog?.kind === "remove" ? <p className={styles.dialogText}>Removing them takes their item out of the totals and turns off their link. They stay in this list and the history.</p> : null}
        {dialog?.kind === "correction" ? (
          <FormField id="correction-note" label="What should they fix?" hint="They see this note and get a link by email." error={fieldError}>
            <TextArea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        ) : null}
      </Dialog>
    </>
  );
}
