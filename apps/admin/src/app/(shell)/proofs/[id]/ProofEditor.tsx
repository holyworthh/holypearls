"use client";

import { type AdminProof, adminProofSchema, ApiError, type ProofDetails } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { api, errorCode, newIdempotencyKey } from "@holypearls/web-kit/api";
import { FileUpload } from "@holypearls/web-kit/file-upload";
import { useState } from "react";
import styles from "../../admin-list.module.css";
import { formatTime } from "../../format";

/*
 * Proof preparation (Pen 112 · dfTCG; OPS-FR-051–052). Staff make a draft
 * from the latest version, add views (each a proof file), write the
 * production details the customer sees, and publish. Published versions
 * can't change; comments stay on their version.
 */

const TONE: Record<string, "info" | "warning" | "success" | "neutral"> = {
  PREPARING: "info",
  REVISION_IN_PROGRESS: "info",
  CHANGES_REQUESTED: "warning",
  AWAITING_APPROVAL: "neutral",
  APPROVED: "success",
  NOT_REQUIRED: "neutral",
  DRAFT: "neutral",
  PUBLISHED: "info",
  SUPERSEDED: "neutral",
};

const DETAIL_FIELDS: { key: keyof ProofDetails; label: string; long?: boolean }[] = [
  { key: "placement", label: "Placement" },
  { key: "dimensions", label: "Dimensions" },
  { key: "colourReference", label: "Colour reference" },
  { key: "quantity", label: "Quantity" },
  { key: "notes", label: "Production notes", long: true },
];

export function ProofEditor({ initial }: { initial: AdminProof }) {
  const [proof, setProof] = useState(initial);
  const draft = proof.versions.find((version) => version.status === "DRAFT") ?? null;
  const [views, setViews] = useState(() => draft?.views.map(({ label, fileId, fileName }) => ({ label, fileId, fileName })) ?? []);
  const [details, setDetails] = useState<ProofDetails>(() => draft?.details ?? { placement: "", dimensions: "", colourReference: "", quantity: String(initial.item.quantity), notes: "" });
  const [newLabel, setNewLabel] = useState("Front");
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reply, setReply] = useState("");
  const [publishKey, setPublishKey] = useState(() => newIdempotencyKey());

  const adopt = (next: AdminProof) => {
    setProof(next);
    const nextDraft = next.versions.find((version) => version.status === "DRAFT");
    if (nextDraft) {
      setViews(nextDraft.views.map(({ label, fileId, fileName }) => ({ label, fileId, fileName })));
      setDetails(nextDraft.details);
    }
  };

  const fail = (problem: unknown, fallback: string) => {
    if (problem instanceof ApiError) setFailure(problem.body.fieldErrors ? Object.values(problem.body.fieldErrors).join(" ") : problem.body.message);
    else setFailure(fallback);
    if (errorCode(problem) === "VERSION_CONFLICT") setFailure("Someone else saved this draft first. Reload to see their changes.");
  };

  const startDraft = async () => {
    setBusy(true);
    setFailure(null);
    try {
      adopt(await api(`/v1/admin/proofs/${proof.id}/versions`, { method: "POST", response: adminProofSchema }));
    } catch (problem) {
      fail(problem, "We couldn't start a new version. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return null;
    setBusy(true);
    setFailure(null);
    try {
      const next = await api(`/v1/admin/proofs/${proof.id}/draft`, { method: "PUT", body: { version: draft.version, views: views.map(({ label, fileId }) => ({ label, fileId })), details }, response: adminProofSchema });
      adopt(next);
      setNotice("Draft saved.");
      return next;
    } catch (problem) {
      fail(problem, "We couldn't save the draft. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    const saved = await save();
    const current = saved?.versions.find((version) => version.status === "DRAFT");
    if (!current) {
      setConfirming(false);
      return;
    }
    setBusy(true);
    try {
      const next = await api(`/v1/admin/proofs/${proof.id}/publish`, { method: "POST", headers: { "idempotency-key": publishKey }, body: { version: current.version }, response: adminProofSchema });
      adopt(next);
      setNotice(`V${current.number} published. Proof is AWAITING_APPROVAL. V${current.number} can't change now. The customer was emailed a link to the Production proof preview.`);
      setPublishKey(newIdempotencyKey());
    } catch (problem) {
      fail(problem, "We couldn't publish. Try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const sendReply = async (versionNumber: number) => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      adopt(await api(`/v1/admin/proofs/${proof.id}/replies`, { method: "POST", body: { versionNumber, body: reply.trim() }, response: adminProofSchema }));
      setReply("");
    } catch (problem) {
      fail(problem, "We couldn't send the reply. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const latestPublished = proof.versions.find((version) => version.status !== "DRAFT");
  const canDraft = !draft && proof.status !== "APPROVED" && proof.status !== "NOT_REQUIRED";

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>
          PROOF · ORDER {proof.order.number} · ITEM {proof.item.position} {proof.item.name.toUpperCase()} × {proof.item.quantity.toLocaleString("en-NG")}
        </p>
        <h1 className={styles.title}>{draft ? `Proof version ${draft.number} (draft)` : latestPublished ? `Proof version ${latestPublished.number}` : "No proof version yet"}</h1>
        <div className={styles.chips}>
          <StatusChip tone={TONE[proof.status] ?? "neutral"}>{proof.status}</StatusChip>
          <span className={styles.hint}>
            Product rule: {proof.required === "NOT_REQUIRED" ? "no proof needed" : proof.required === "OPTIONAL" ? "proof optional" : "proof required"} · item {proof.item.status}
            {proof.status !== "APPROVED" ? " until approval" : ""}
          </span>
        </div>
      </header>

      {proof.status === "NOT_REQUIRED" ? (
        <Notice tone="info" title="No proof needed">
          <p>The product rule says no proof. Proof status NOT_REQUIRED.</p>
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="success" title="Done" live>
          <p>{notice}</p>
        </Notice>
      ) : null}
      {failure ? (
        <Notice tone="error" title="Not saved" live>
          <p>{failure}</p>
        </Notice>
      ) : null}

      <div className={styles.filters}>
        <a className={styles.action} href={`/proofs`}>
          All proofs
        </a>
        <span className={styles.spacer} />
        {canDraft ? (
          <Button type="button" onClick={() => void startDraft()} loading={busy}>
            {latestPublished ? `New version (V${latestPublished.number + 1})` : "Start proof V1"}
          </Button>
        ) : null}
        {draft ? (
          <>
            <Button type="button" variant="secondary" onClick={() => void save()} loading={busy && !confirming}>
              Save draft
            </Button>
            <Button type="button" onClick={() => setConfirming(true)}>
              Publish V{draft.number}
            </Button>
          </>
        ) : null}
      </div>

      <div className={styles.columns}>
        <div className={styles.tableCol}>
          {draft ? (
            <>
              <section className={styles.panel} aria-labelledby="views-title">
                <h2 id="views-title" className={styles.panelTitle}>
                  Views
                </h2>
                {views.length ? (
                  <ul className={styles.plainList}>
                    {views.map((view, index) => (
                      <li key={`${view.fileId}-${index}`}>
                        <strong>{view.label}</strong> · {view.fileName}{" "}
                        <button type="button" className={styles.action} onClick={() => setViews((current) => current.filter((_, at) => at !== index))}>
                          Remove<span className="hp-visually-hidden"> {view.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.hint}>No views yet. Add Front, Back or a detail view with its proof file.</p>
                )}
                <FormField id="view-label" label="View name">
                  <TextField value={newLabel} maxLength={60} onChange={(event) => setNewLabel(event.target.value)} />
                </FormField>
                <FileUpload
                  purpose="PROOF"
                  label="Proof file"
                  hint="SVG, PDF, AI or PNG"
                  onChange={(file) => {
                    if (file) setViews((current) => [...current, { label: newLabel.trim() || `View ${current.length + 1}`, fileId: file.id, fileName: file.name }]);
                  }}
                />
              </section>
              <section className={styles.panel} aria-labelledby="details-title">
                <h2 id="details-title" className={styles.panelTitle}>
                  Production details shown to customer (FUL-FR-002)
                </h2>
                {DETAIL_FIELDS.map((field) => (
                  <FormField key={field.key} id={`detail-${field.key}`} label={field.label}>
                    {field.long ? (
                      <TextArea rows={3} value={details[field.key]} maxLength={2000} onChange={(event) => setDetails((current) => ({ ...current, [field.key]: event.target.value }))} />
                    ) : (
                      <TextField value={details[field.key]} maxLength={240} onChange={(event) => setDetails((current) => ({ ...current, [field.key]: event.target.value }))} />
                    )}
                  </FormField>
                ))}
              </section>
            </>
          ) : null}

          {proof.customerFiles.length ? (
            <section className={styles.panel} aria-labelledby="customer-files">
              <h2 id="customer-files" className={styles.panelTitle}>
                Files the customer sent
              </h2>
              <ul className={styles.plainList}>
                {proof.customerFiles.map((file) => (
                  <li key={file.id}>
                    {file.name} · {file.status}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className={styles.detailCol} aria-label="Versions and comments">
          <section className={styles.panel} aria-labelledby="versions-title">
            <h2 id="versions-title" className={styles.panelTitle}>
              Versions
            </h2>
            {proof.versions.length ? (
              <ul className={styles.plainList}>
                {proof.versions.map((version) => (
                  <li key={version.id}>
                    <strong>V{version.number}</strong> {version.publishedAt ? `· ${formatTime(version.publishedAt)}` : "· draft"} <StatusChip tone={TONE[version.status] ?? "neutral"}>{version.status}</StatusChip>
                    {version.decision?.note ? <span className={styles.hint}> · “{version.decision.note}”</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>No versions yet.</p>
            )}
            <p className={styles.hint}>Published versions can&apos;t change. Comments stay on their version.</p>
          </section>
          {latestPublished ? (
            <section className={styles.panel} aria-labelledby="comments-title">
              <h2 id="comments-title" className={styles.panelTitle}>
                Comments on V{latestPublished.number} ({latestPublished.comments.length})
              </h2>
              {latestPublished.comments.length ? (
                <ul className={styles.plainList}>
                  {latestPublished.comments.map((comment) => (
                    <li key={comment.id}>
                      <strong>{comment.author}</strong> · {comment.kind.toLowerCase().replace("_", " ")} · {formatTime(comment.createdAt)}
                      <br />
                      {comment.body}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.hint}>No comments yet.</p>
              )}
              <FormField id="proof-reply" label="Reply to the customer">
                <TextArea rows={2} value={reply} maxLength={4000} onChange={(event) => setReply(event.target.value)} />
              </FormField>
              <Button type="button" variant="secondary" onClick={() => void sendReply(latestPublished.number)} disabled={busy || !reply.trim()}>
                Send reply
              </Button>
            </section>
          ) : null}
        </aside>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Publish V${draft?.number ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void publish()} loading={busy}>
              Publish V{draft?.number}
            </Button>
          </>
        }
      >
        <p>Publish V{draft?.number}? It can&apos;t change after this, and the customer is emailed a link to review it. The item stays AWAITING_PREREQUISITE until approval.</p>
      </Dialog>
    </>
  );
}
