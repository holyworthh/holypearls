"use client";

import { ApiError, IDEMPOTENCY_KEY_HEADER, IMPORT_FIELD_LABELS, type ImportBatch, importBatchSchema, type ImportField } from "@holypearls/contracts";
import { Button, Notice, Select, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { useState } from "react";
import { FileUpload } from "../FileUpload";
import styles from "./workspace.module.css";

const STEPS = ["Upload", "Match columns", "Check rows", "Import"] as const;
const DECISIONS = [
  { value: "MERGE", label: "Merge into the existing person" },
  { value: "REPLACE", label: "Replace their answers" },
  { value: "KEEP_BOTH", label: "Keep both" },
  { value: "SKIP", label: "Skip this row" },
];

/**
 * Import people from a spreadsheet (Pen 75 · mEw4a; PRD-05 B2B-FR-070–073):
 * upload, match columns, check rows, import. Problems show by line with a
 * fix; duplicates need a choice; valid rows can go in first while the rest
 * are fixed. No row is ever dropped without a choice.
 */
export function ImportView({ organizationId, collectionId, initial }: { organizationId: string; collectionId: string; initial: ImportBatch | null }) {
  const [batch, setBatch] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [key, setKey] = useState(() => newIdempotencyKey());
  const base = `/v1/organizations/${organizationId}/collections/${collectionId}/imports`;
  const step = !batch ? 0 : batch.counts.imported + batch.counts.skipped === batch.counts.rows ? 3 : batch.counts.problems || batch.counts.duplicates ? 2 : 1;

  const call = async (name: string, run: () => Promise<ImportBatch>, done?: string) => {
    setBusy(name);
    setNotice(null);
    try {
      setBatch(await run());
      if (done) setNotice({ tone: "success", text: done });
    } catch (error) {
      const reason = errorReason(error);
      setNotice({
        tone: "error",
        text:
          reason === "FILE_NOT_READY"
            ? "We're still checking your file. Try again in a moment."
            : errorCode(error) === "VERSION_CONFLICT"
              ? "Someone else changed this import. Reload the page."
              : error instanceof ApiError && error.body.fieldErrors
                ? Object.values(error.body.fieldErrors)[0]!
                : (error instanceof ApiError && error.body.message) || "That didn't work. Try again.",
      });
    } finally {
      setBusy(null);
    }
  };
  const start = (fileId: string) =>
    call("start", async () => {
      const started = await api(base, { method: "POST", body: { fileId }, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: importBatchSchema });
      setChecking(false);
      setKey(newIdempotencyKey());
      return started;
    });
  const fixRow = (rowId: string, body: Record<string, unknown>) => batch && void call(`row-${rowId}`, () => api(`${base}/${batch.id}/rows/${rowId}`, { method: "PUT", body: { ...body, version: batch.version }, response: importBatchSchema }));
  const runImport = (partial: boolean) =>
    batch &&
    void call(
      partial ? "partial" : "all",
      async () => {
        const result = await api(`${base}/${batch.id}/import`, { method: "POST", body: { partial, version: batch.version }, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: importBatchSchema });
        setKey(newIdempotencyKey());
        return result;
      },
      partial ? "Imported the valid rows. The rest are below, waiting to be fixed." : "Imported. Everyone gets an invite link by email.",
    );

  const waitingRows = batch ? batch.rows.filter((row) => row.outcome === "PENDING" && (row.problems.length || (row.duplicateOf && !row.decision))) : [];
  return (
    <>
      <ol className={styles.steps} aria-label="Import steps">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={index < step ? styles.stepDone : undefined}>
            {label}
          </li>
        ))}
      </ol>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      {!batch ? (
        <section className={styles.detail} aria-labelledby="upload-title">
          <h2 id="upload-title" className={styles.detailTitle}>
            Upload your spreadsheet
          </h2>
          <p className={styles.dialogText}>A CSV with one person per row: a name and an email, then any of size, name on chest and branch. The first row names the columns. Up to 5 MB and 5,000 rows.</p>
          <FileUpload purpose="CSV_IMPORT" label="Drop your CSV or browse files" hint="CSV, up to 5 MB and 5,000 rows" accept=".csv,text/csv" onUploaded={() => setChecking(true)} onChange={(file) => file && void start(file.id)} />
          {checking ? <p className={styles.rowMeta}>Checking your file… this takes a moment.</p> : null}
        </section>
      ) : (
        <div className={styles.orderLayout}>
          <div className={styles.templateSpec}>
            <div className={styles.importTotals}>
              <div className={styles.total}>
                <span className={styles.totalValue}>{batch.counts.rows}</span>
                <span className={styles.rowMeta}>rows in {batch.fileName}</span>
              </div>
              <div className={styles.total}>
                <span className={styles.totalValue}>{batch.counts.ready + batch.counts.imported}</span>
                <span className={styles.rowMeta}>{batch.counts.imported ? `imported or ready` : "ready to import"}</span>
              </div>
              <div className={styles.total}>
                <span className={styles.totalValue}>{waitingRows.length}</span>
                <span className={styles.rowMeta}>need fixing</span>
              </div>
            </div>
            <section className={styles.detail} aria-labelledby="fix-title">
              <h2 id="fix-title" className={styles.detailTitle}>
                {waitingRows.length ? `${waitingRows.length} ${waitingRows.length === 1 ? "row needs" : "rows need"} fixing` : "Every row is ready"}
              </h2>
              {waitingRows.map((row) => {
                const problem = row.problems[0];
                const field = (problem?.field ?? "email") as ImportField;
                const editKey = `${row.id}:${field}`;
                return (
                  <div key={row.id} className={styles.detailRow}>
                    <div className={styles.detailText}>
                      <span className={styles.detailLabel}>
                        Line {row.line} · {problem ? IMPORT_FIELD_LABELS[field] : "Duplicate"}
                      </span>
                      <span className={styles.detailValue}>{problem ? problem.message : `${row.values.email} is already in this collection`}</span>
                      {problem ? (
                        <div className={styles.shareRow}>
                          <TextField aria-label={`New ${IMPORT_FIELD_LABELS[field].toLowerCase()} for line ${row.line}`} value={edits[editKey] ?? row.values[field] ?? ""} onChange={(event) => setEdits({ ...edits, [editKey]: event.target.value })} />
                          <Button variant="secondary" loading={busy === `row-${row.id}`} onClick={() => fixRow(row.id, { values: { [field]: edits[editKey] ?? row.values[field] ?? null } })}>
                            Save<span className="hp-visually-hidden"> line {row.line}</span>
                          </Button>
                          <Button variant="tertiary" onClick={() => fixRow(row.id, { decision: "SKIP" })}>
                            Skip<span className="hp-visually-hidden"> line {row.line}</span>
                          </Button>
                        </div>
                      ) : (
                        <Select aria-label={`What to do with line ${row.line}`} value={row.decision ?? ""} onChange={(event) => fixRow(row.id, { decision: event.target.value })} options={[{ value: "", label: "Choose what to do" }, ...DECISIONS]} />
                      )}
                    </div>
                  </div>
                );
              })}
              {batch.counts.skipped ? <p className={styles.rowMeta}>{batch.counts.skipped} skipped by your choice.</p> : null}
            </section>
          </div>
          <aside className={styles.detail} aria-labelledby="columns-title">
            <h2 id="columns-title" className={styles.detailTitle}>
              Column matching
            </h2>
            {batch.fields.map((field) => (
              <div key={field} className={styles.detailRow}>
                <div className={styles.detailText}>
                  <span className={styles.detailLabel}>{IMPORT_FIELD_LABELS[field]}</span>
                  <Select
                    aria-label={`Column for ${IMPORT_FIELD_LABELS[field]}`}
                    value={batch.mapping[field] ?? ""}
                    onChange={(event) => void call("mapping", () => api(`${base}/${batch.id}/mapping`, { method: "PUT", body: { mapping: { ...batch.mapping, [field]: event.target.value || null }, version: batch.version }, response: importBatchSchema }))}
                    options={[{ value: "", label: "Not in the file" }, ...batch.headers.map((header) => ({ value: header, label: header }))]}
                  />
                </div>
              </div>
            ))}
            {batch.counts.ready ? (
              <Button loading={busy === "partial" || busy === "all"} onClick={() => runImport(waitingRows.length > 0)}>
                Import {batch.counts.ready} valid {batch.counts.ready === 1 ? "row" : "rows"}
              </Button>
            ) : null}
            {waitingRows.length ? <p className={styles.rowMeta}>Fix {waitingRows.length} {waitingRows.length === 1 ? "row" : "rows"} first, or import the valid rows now and fix the rest later.</p> : null}
            <p className={styles.dialogText}>Imported people get an invite link. Private details stay visible only to them and organisers.</p>
          </aside>
        </div>
      )}
    </>
  );
}
