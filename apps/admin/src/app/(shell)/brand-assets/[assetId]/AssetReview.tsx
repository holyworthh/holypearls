"use client";

import { type AdminAsset, adminAssetSchema, ApiError, type AssetVersion, BRAND_ASSET_KIND_LABELS, IDEMPOTENCY_KEY_HEADER } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, StatusChip, TextArea } from "@holypearls/ui";
import { api, newIdempotencyKey } from "@holypearls/web-kit/api";
import { useState } from "react";
import { z } from "zod";
import list from "../../admin-list.module.css";
import { formatTime } from "../../format";

const TONE = { PROCESSING: "neutral", NEEDS_REVIEW: "warning", PRODUCTION_READY: "success", SUPERSEDED: "neutral", RETIRED: "error", ARCHIVED: "neutral" } as const;
const USABLE = new Set(["PRODUCTION_READY", "SUPERSEDED"]);

/** Frame 116: the version under review, its checks note, the version history, and retire or archive. */
export function AssetReview({ initial, canSeeOrganization }: { initial: AdminAsset; canSeeOrganization: boolean }) {
  const [asset, setAsset] = useState(initial);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ version: AssetVersion; action: "retire" | "archive" } | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const waiting = asset.versions.find((version) => version.status === "NEEDS_REVIEW" || version.status === "PROCESSING") ?? null;
  const current = asset.versions.find((version) => version.status === "PRODUCTION_READY") ?? null;

  const run = async (name: string, call: () => Promise<AdminAsset>, done: string) => {
    setBusy(name);
    setResult(null);
    try {
      setAsset(await call());
      setResult({ tone: "success", text: done });
      setNote("");
      setKey(newIdempotencyKey());
    } catch (problem) {
      setResult({ tone: "error", text: problem instanceof ApiError ? problem.body.message : "Try again." });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };
  const decide = (decision: "PRODUCTION_READY" | "KEEP_IN_REVIEW") => {
    if (!waiting) return;
    if (decision === "KEEP_IN_REVIEW" && !note.trim()) {
      setNoteError("Tell the organization what to change");
      return;
    }
    void run(
      decision,
      () => api(`/v1/admin/brand-assets/versions/${waiting.id}/review`, { method: "POST", body: { decision, note: note.trim() || null }, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: adminAssetSchema }),
      decision === "PRODUCTION_READY"
        ? `V${waiting.number} is PRODUCTION_READY.${current ? ` V${current.number} becomes SUPERSEDED.` : ""} The organization has been emailed.`
        : `V${waiting.number} stays in review. The organization has been emailed your note.`,
    );
  };
  const download = async (fileId: string) => {
    const { url } = await api(`/v1/files/${fileId}/download`, { response: z.object({ url: z.string() }) });
    window.open(url, "_blank", "noopener");
  };

  return (
    <>
      <header className={list.head}>
        <p className={list.eyebrow}>
          BRAND ASSET · {asset.organizationName.toUpperCase()} · {BRAND_ASSET_KIND_LABELS[asset.kind].toUpperCase()}
        </p>
        <h1 className={list.title}>{waiting ? `${asset.name} V${waiting.number}` : asset.name}</h1>
        {waiting ? (
          <div className={list.chips}>
            <StatusChip tone={TONE[waiting.status]}>{waiting.status}</StatusChip>
            <span className={list.hint}>
              Uploaded{waiting.uploadedBy ? ` by ${waiting.uploadedBy}` : ""} {formatTime(waiting.createdAt)}
              {current ? ` · V${current.number} is PRODUCTION_READY and stays usable` : ""}
            </span>
          </div>
        ) : null}
        {canSeeOrganization ? (
          <a className={list.action} href={`/organizations/${asset.organizationId}`}>
            Open the organization (read only)
          </a>
        ) : null}
      </header>
      {result ? (
        <Notice tone={result.tone} live>
          {result.text}
        </Notice>
      ) : null}
      {waiting ? (
        <section className={list.panel} aria-labelledby="review-title">
          <h2 id="review-title" className={list.panelTitle}>
            Production readiness (print and embroidery)
          </h2>
          <p className={list.hint}>Check the vector file, the minimum size for embroidery, the colour count and outlined fonts. Your note is shown to the organization.</p>
          <div className={list.panelActions}>
            <Button type="button" variant="secondary" onClick={() => void download(waiting.fileId)}>
              Download V{waiting.number}
            </Button>
          </div>
          <FormField id="review-note" label="Review note (shown to the organization)" error={noteError}>
            <TextArea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteError(undefined);
              }}
            />
          </FormField>
          <div className={list.panelActions}>
            <Button type="button" loading={busy === "PRODUCTION_READY"} disabled={waiting.status !== "NEEDS_REVIEW"} onClick={() => decide("PRODUCTION_READY")}>
              Mark PRODUCTION_READY
            </Button>
            <Button type="button" variant="secondary" loading={busy === "KEEP_IN_REVIEW"} disabled={waiting.status !== "NEEDS_REVIEW"} onClick={() => decide("KEEP_IN_REVIEW")}>
              Keep in review, ask for a new file
            </Button>
          </div>
          {waiting.status === "PROCESSING" ? <p className={list.hint}>The file is still being checked. It can be reviewed once the check finishes.</p> : null}
        </section>
      ) : null}
      <section className={list.panel} aria-labelledby="versions-title">
        <h2 id="versions-title" className={list.panelTitle}>
          Versions
        </h2>
        <ul className={list.plainList}>
          {asset.versions.map((version) => (
            <li key={version.id} className={list.hint}>
              <span className={list.strong}>V{version.number}</span> <StatusChip tone={TONE[version.status]}>{version.status}</StatusChip>
              {version.reviewNote ? ` · ${version.reviewNote}` : ""}{" "}
              {USABLE.has(version.status) ? (
                <button type="button" className={list.action} onClick={() => setConfirm({ version, action: "retire" })}>
                  Retire V{version.number}
                </button>
              ) : null}{" "}
              {version.status !== "ARCHIVED" ? (
                <button type="button" className={list.action} onClick={() => setConfirm({ version, action: "archive" })}>
                  Archive V{version.number}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className={list.hint}>Past orders keep pointing at the exact version they used.</p>
      </section>
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? (confirm.action === "retire" ? `Retire ${asset.name} V${confirm.version.number}?` : `Archive ${asset.name} V${confirm.version.number}?`) : ""}
        footer={
          confirm ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={busy === "change"}
                onClick={() =>
                  void run(
                    "change",
                    () => api(`/v1/admin/brand-assets/versions/${confirm.version.id}/${confirm.action}`, { method: "POST", response: adminAssetSchema }),
                    confirm.action === "retire" ? `V${confirm.version.number} is RETIRED and can't be used for new orders.` : `V${confirm.version.number} is ARCHIVED.`,
                  )
                }
              >
                {confirm.action === "retire" ? "Retire" : "Archive"}
              </Button>
            </>
          ) : null
        }
      >
        <p className={list.hint}>{confirm?.action === "retire" ? "New orders can't use this version. Past orders are unchanged." : "The version stays in history and can't be deleted."}</p>
      </Dialog>
    </>
  );
}
