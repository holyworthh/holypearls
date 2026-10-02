"use client";

import { ApiError, type CustomerProof, customerProofSchema } from "@holypearls/contracts";
import { Checkbox, FormField, Notice, StatusChip, TextArea } from "@holypearls/ui";
import { Lock, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api, newIdempotencyKey } from "../../lib/api";
import { useEmailCode } from "../EmailCode";
import s from "./proof.module.css";

/*
 * The proof viewer (Pen 26 · u6wexU desktop, 49 · Hnlcm mobile, 50 · n86Z1a
 * history and approved; FUL-FR-002–004). Titled "Production proof preview"
 * until approved. Views, zoom (buttons, keyboard and pinch), the page image
 * loaded first and the high-resolution page on zoom (TECH-04 §10). Approving
 * needs the acknowledgement and, if none was checked in 24 hours, an email
 * code. Questions keep the proof undecided.
 */

const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

const STATUS: Record<string, { label: string; tone: "warning" | "success" | "info" | "neutral" }> = {
  AWAITING_APPROVAL: { label: "Awaiting your approval", tone: "warning" },
  APPROVED: { label: "APPROVED FOR PRODUCTION", tone: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "info" },
  REVISION_IN_PROGRESS: { label: "We're making your changes", tone: "info" },
  PREPARING: { label: "Being prepared", tone: "neutral" },
  NOT_REQUIRED: { label: "No proof needed", tone: "neutral" },
};

const VERSION_WORDS: Record<string, string> = { PUBLISHED: "current", APPROVED: "approved", CHANGES_REQUESTED: "changes requested", SUPERSEDED: "replaced" };

const previewSchema = z.object({ url: z.string() });

function useImage(fileId: string | undefined, page: number, high: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!fileId) return;
    let live = true;
    setFailed(false);
    const kind = high ? `page&page=${page}` : page > 1 ? `page&page=${page}` : "preview";
    api(`/v1/files/${fileId}/preview?kind=${kind}`, { response: previewSchema })
      .catch(() => api(`/v1/files/${fileId}/preview?kind=preview`, { response: previewSchema }))
      .then((result) => live && setUrl(result.url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [fileId, page, high]);
  return { url, failed };
}

export function ProofView({ initial }: { initial: CustomerProof }) {
  const [proof, setProof] = useState(initial);
  const [shownNumber, setShownNumber] = useState(initial.current?.number ?? null);
  const [viewIndex, setViewIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<"comments" | "details" | "history">("comments");
  const [ticked, setTicked] = useState(false);
  const [tickError, setTickError] = useState<string | null>(null);
  const [mode, setMode] = useState<"changes" | "question" | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newIdempotencyKey());
  const code = useEmailCode("APPROVE_PROOF");

  const shown = proof.history.find((version) => version.number === shownNumber) ?? null;
  const isCurrent = shownNumber === proof.current?.number;
  const view = shown?.views[viewIndex] ?? shown?.views[0];
  const image = useImage(view?.fileId, 1, zoom > 1);
  const approved = proof.status === "APPROVED";
  const title = approved ? `${proof.item.name} · Proof V${proof.current?.number}` : `Production proof preview · ${proof.item.name} V${shown?.number ?? ""}`;
  const status = STATUS[proof.status] ?? STATUS.PREPARING!;

  const base = `/v1/orders/${proof.order.id}/proofs/${proof.id}`;

  const approve = async () => {
    if (!proof.current) return;
    if (!ticked) {
      setTickError("Tick the box to confirm you've reviewed the proof.");
      return;
    }
    setTickError(null);
    setFailure(null);
    setBusy(true);
    try {
      const next = await code.run(() => api(`${base}/approve`, { method: "POST", headers: { "idempotency-key": key }, body: { versionNumber: proof.current!.number, acknowledged: true }, response: customerProofSchema }));
      if (next) setProof(next);
    } catch (problem) {
      setFailure(problem instanceof ApiError ? problem.body.message : "We couldn't record your approval. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!proof.current || !mode) return;
    if (!note.trim()) {
      setNoteError(mode === "changes" ? "Tell us what to change." : "Type your question.");
      return;
    }
    setNoteError(null);
    setBusy(true);
    try {
      const next = await api(`${base}/${mode === "changes" ? "changes" : "questions"}`, {
        method: "POST",
        body: mode === "changes" ? { versionNumber: proof.current.number, note: note.trim() } : { versionNumber: proof.current.number, body: note.trim() },
        response: customerProofSchema,
      });
      setProof(next);
      setNote("");
      setMode(null);
      setTab("comments");
    } catch (problem) {
      setFailure(problem instanceof ApiError ? problem.body.message : "We couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!proof.current) {
    return (
      <div className={s.panel}>
        <h1 className={s.h1}>{proof.status === "NOT_REQUIRED" ? `${proof.item.name}: no proof needed` : `${proof.item.name}: your proof is being prepared`}</h1>
        <p className={s.muted}>{proof.status === "NOT_REQUIRED" ? "This product goes into production without a proof." : "We'll email you as soon as it's ready to review."}</p>
        <a className={s.secondary} href={`/orders/${proof.order.id}`}>
          Back to your order
        </a>
      </div>
    );
  }

  const comments = isCurrent ? proof.current.comments : [];

  return (
    <>
      <div className={s.bar}>
        <div className={s.titleBlock}>
          <p className={s.mono}>ORDER {proof.order.number}</p>
          <div className={s.titleRow}>
            <h1 className={s.h1}>{title}</h1>
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
          </div>
        </div>
        {proof.history.length > 1 ? (
          <ul className={s.versions} aria-label="Versions">
            {[...proof.history].reverse().map((version) => (
              <li key={version.number}>
                <button type="button" className={s.versionButton} aria-pressed={version.number === shownNumber} onClick={() => (setShownNumber(version.number), setViewIndex(0), setZoom(1))}>
                  V{version.number} · {VERSION_WORDS[version.status] ?? version.status.toLowerCase()}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <span className={s.itemCount}>
          Item {proof.item.position} of {proof.item.of}
        </span>
      </div>

      <div className={s.body}>
        <section className={s.viewer} aria-label="Proof artwork">
          <div className={s.toolbar} role="toolbar" aria-label="Viewer">
            <button type="button" className={s.tool} aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} disabled={zoom <= 1}>
              <ZoomOut size={18} aria-hidden="true" />
            </button>
            <button type="button" className={s.tool} aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(4, value + 0.5))}>
              <ZoomIn size={18} aria-hidden="true" />
            </button>
            <button type="button" className={s.tool} aria-label="Fit to screen" onClick={() => setZoom(1)}>
              <Maximize2 size={18} aria-hidden="true" />
            </button>
            <span className={s.zoom} aria-live="polite">
              {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
            </span>
            <span className={s.spacer} />
            {shown!.views.map((item, index) => (
              <button key={`${item.label}-${index}`} type="button" className={s.tool} aria-pressed={index === viewIndex} onClick={() => (setViewIndex(index), setZoom(1))}>
                {item.label}
              </button>
            ))}
          </div>
          <div className={s.stage} data-zoomed={zoom > 1 ? "true" : "false"} tabIndex={0} aria-label={`${view?.label ?? "Proof"} view. Use the zoom buttons, or + and - keys.`} onKeyDown={(event) => {
            if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(4, value + 0.5));
            if (event.key === "-") setZoom((value) => Math.max(1, value - 0.5));
          }}>
            {image.url ? (
              <img src={image.url} alt={`${proof.item.name}, proof V${shown!.number}, ${view?.label ?? ""} view`} style={{ transform: `scale(${zoom})` }} />
            ) : (
              <p className={s.placeholder}>{image.failed ? "We couldn't load this view. Try again in a moment." : "Loading the proof…"}</p>
            )}
          </div>
        </section>

        <aside className={s.rail} aria-label="Proof details and decision">
          <div className={s.tabs} role="tablist">
            {(["comments", "details", "history"] as const).map((name) => (
              <button key={name} type="button" role="tab" id={`tab-${name}`} aria-controls={`panel-${name}`} aria-selected={tab === name} className={s.tab} onClick={() => setTab(name)}>
                {name === "comments" ? `Comments · ${comments.length}` : name === "details" ? "Details" : "History"}
              </button>
            ))}
          </div>
          <div className={s.panel} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === "comments" ? (
              comments.length ? (
                comments.map((comment, index) => (
                  <div key={comment.id} className={s.comment}>
                    <span className={s.pin} aria-hidden="true">
                      {index + 1}
                    </span>
                    <div>
                      <span className={s.who}>
                        {comment.author}
                        {comment.kind === "CHANGE_REQUEST" ? " · change requested" : comment.kind === "QUESTION" ? " · question" : ""}
                      </span>
                      <p className={s.text}>{comment.body}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className={s.muted}>{isCurrent ? "No comments yet. Ask us anything about this proof." : "Comments are shown on the current version."}</p>
              )
            ) : null}
            {tab === "details" ? (
              <dl className={s.facts}>
                <dt>Placement</dt>
                <dd>{shown!.details.placement || "—"}</dd>
                <dt>Dimensions</dt>
                <dd>{shown!.details.dimensions || "—"}</dd>
                <dt>Colour reference</dt>
                <dd>{shown!.details.colourReference || "—"}</dd>
                <dt>Quantity</dt>
                <dd>{shown!.details.quantity || proof.item.quantity.toLocaleString("en-NG")}</dd>
                <dt>Production notes</dt>
                <dd>{shown!.details.notes || "—"}</dd>
              </dl>
            ) : null}
            {tab === "history" ? (
              <ol className={s.history}>
                {proof.history.flatMap((version) => [
                  version.decision ? (
                    <li key={`${version.number}-decision`}>
                      <span className={s.who}>
                        V{version.number} · {version.decision.decision === "APPROVED" ? "APPROVED" : "CHANGES REQUESTED"}
                      </span>
                      <p className={s.muted}>
                        {day(version.decision.at)} · {version.decision.by}
                      </p>
                      <p className={s.muted}>{version.decision.decision === "APPROVED" ? "Acknowledged artwork, spelling, placement and specifications." : `“${version.decision.note}”`}</p>
                    </li>
                  ) : null,
                  <li key={`${version.number}-sent`}>
                    <span className={s.who}>V{version.number} · SENT</span>
                    <p className={s.muted}>
                      {version.publishedAt ? day(version.publishedAt) : ""} · {version.publishedBy ?? "HolyPearls studio"}
                    </p>
                    {version.details.notes ? <p className={s.muted}>{version.details.notes}</p> : null}
                  </li>,
                ])}
              </ol>
            ) : null}
          </div>

          <div className={s.decision}>
            {approved ? (
              <p className={s.locked}>
                <Lock size={16} aria-hidden="true" /> Approved version is locked. Changes now go through a change request and may affect cost and timing.
              </p>
            ) : proof.canDecide && isCurrent ? (
              <>
                <Checkbox id="proof-ack" label="I have reviewed the artwork, spelling, placement and specifications shown." checked={ticked} onChange={(event) => setTicked(event.target.checked)} hint={tickError ?? undefined} />
                <button type="button" className={s.approve} onClick={() => void approve()} disabled={busy}>
                  {busy && !mode ? "Approving…" : "Approve for production"}
                </button>
                {mode ? (
                  <div className={s.ask}>
                    <FormField id="proof-note" label={mode === "changes" ? "What should we change?" : "Your question"} error={noteError ?? undefined}>
                      <TextArea rows={3} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} />
                    </FormField>
                    <button type="button" className={s.secondary} onClick={() => void send()} disabled={busy}>
                      {mode === "changes" ? "Send change request" : "Send question"}
                    </button>
                    <button type="button" className={s.tool} onClick={() => setMode(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button type="button" className={s.secondary} onClick={() => setMode("changes")}>
                      Request changes
                    </button>
                    <button type="button" className={s.secondary} onClick={() => setMode("question")}>
                      Ask a question
                    </button>
                  </>
                )}
                <p className={s.small}>
                  Approve is enabled once the box is ticked. Once production begins, changes may affect cost and delivery or may no longer be possible. Requesting changes creates Proof V{proof.current.number + 1}.
                </p>
              </>
            ) : (
              <p className={s.muted}>{isCurrent ? "We're working on the next version. We'll email you when it's ready." : `You're looking at V${shownNumber}. Decisions are made on the current version.`}</p>
            )}
            {failure ? (
              <Notice tone="error" title="Not sent" live>
                <p>{failure}</p>
              </Notice>
            ) : null}
          </div>
        </aside>
      </div>
      {code.dialog}
    </>
  );
}
