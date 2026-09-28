"use client";

import { type FileView, fileUrlSchema, fileViewSchema, uploadCreatedSchema } from "@holypearls/contracts";
import { Button, StatusChip } from "@holypearls/ui";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { api, errorCode } from "../lib/api";
import styles from "./FileUpload.module.css";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "checking"; file: FileView }
  | { kind: "done"; file: FileView; thumbnail: string | null }
  | { kind: "failed"; message: string };

export interface FileUploadProps {
  purpose: "ARTWORK" | "PROJECT_ATTACHMENT" | "PROBLEM_PHOTO";
  label?: string;
  /** Allowed types in words, matching the purpose's rule (TECH-04 §4). */
  hint?: string;
  accept?: string;
  owner?: { type: string; id: string };
  onChange?: (file: FileView | null) => void;
}

/** PUT with progress events; fetch can't report upload progress. */
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("content-type", file.type);
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status})`)));
    request.onerror = () => reject(new Error("Network error"));
    request.send(file);
  });
}

const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function describe(file: FileView) {
  const kind = file.type === "application/pdf" ? "PDF" : file.type.replace("image/", "").toUpperCase();
  const size = file.metadata?.width ? `${file.metadata.width} × ${file.metadata.height}` : file.metadata?.pages ? `${file.metadata.pages} page${file.metadata.pages === 1 ? "" : "s"}` : sizeLabel(file.sizeBytes);
  return `${kind} · ${size}`;
}

/**
 * Reusable upload (Pen HP/Form/FileUpload, COM-FR-052): progress, success,
 * failure and retry. The browser uploads straight to storage with a
 * 15-minute URL; the server checks the real type and makes the preview.
 */
export function FileUpload({
  purpose,
  label = "Drop your logo or browse files",
  hint = "JPEG, PNG or PDF, up to 50 MB",
  accept = "image/jpeg,image/png,application/pdf",
  owner,
  onChange,
}: FileUploadProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  // While the worker checks the file, poll its status.
  useEffect(() => {
    if (phase.kind !== "checking") return;
    const timer = setTimeout(async () => {
      try {
        const file = await api(`/v1/files/${phase.file.id}`, { response: fileViewSchema });
        if (file.status === "PROCESSING") return setPhase({ kind: "checking", file });
        const thumbnail = file.hasThumbnail
          ? (await api(`/v1/files/${file.id}/preview?kind=thumbnail`, { response: fileUrlSchema }).catch(() => null))?.url ?? null
          : null;
        setPhase({ kind: "done", file, thumbnail });
        onChange?.(file.status === "REJECTED" ? null : file);
      } catch {
        setPhase({ kind: "failed", message: "We lost track of your upload. Try again." });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, onChange]);

  const start = async (file: File) => {
    lastFile.current = file;
    setPhase({ kind: "uploading", percent: 0 });
    try {
      const created = await api("/v1/files/uploads", {
        method: "POST",
        body: { purpose, fileName: file.name, size: file.size, contentType: file.type || "application/octet-stream", owner },
        response: uploadCreatedSchema,
      });
      await putWithProgress(created.uploadUrl, file, (percent) => setPhase({ kind: "uploading", percent }));
      const done = await api(`/v1/files/${created.file.id}/complete`, { method: "POST", response: fileViewSchema });
      setPhase({ kind: "checking", file: done });
    } catch (error) {
      const code = errorCode(error);
      const body = (error as { body?: { fieldErrors?: Record<string, string> } }).body;
      setPhase({
        kind: "failed",
        message:
          body?.fieldErrors?.file ??
          (code === "NOT_SIGNED_IN" ? "Sign in, or open your link again, to upload files." : "The upload didn't finish. Check your connection and try again."),
      });
    }
  };

  const choose = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void start(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  };

  const reset = () => {
    setPhase({ kind: "idle" });
    onChange?.(null);
    if (input.current) input.current.value = "";
  };

  const status = (() => {
    if (phase.kind === "uploading") return { text: `Uploading… ${phase.percent}%`, tone: "neutral" as const };
    if (phase.kind === "checking") return { text: "Checking file…", tone: "neutral" as const };
    if (phase.kind === "done" && phase.file.status === "READY") return { text: `Uploaded · ${describe(phase.file)}`, tone: "success" as const };
    if (phase.kind === "done" && phase.file.status === "NEEDS_REVIEW") return { text: phase.file.reason ?? "Our team will check this file.", tone: "warning" as const };
    if (phase.kind === "done") return { text: phase.file.reason ?? "We can't use this file.", tone: "error" as const };
    if (phase.kind === "failed") return { text: phase.message, tone: "error" as const };
    return null;
  })();

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.zone} ${dragging ? styles.dragging : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {phase.kind === "done" && phase.thumbnail ? (
          // A short-lived signed preview URL, so not a Next image-optimizer asset.
          <img className={styles.thumb} src={phase.thumbnail} alt={`Preview of ${phase.file.name}`} />
        ) : (
          <svg className={styles.icon} viewBox="0 0 26 26" aria-hidden="true">
            <path d="M13 17V5M8 10l5-5 5 5M5 17v4h16v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <p className={styles.title}>{phase.kind === "done" || phase.kind === "checking" ? phase.file.name : label}</p>
        <p className={styles.hint} id={`${inputId}-hint`}>
          {hint}
        </p>
        {phase.kind === "uploading" ? (
          <div className={styles.bar} role="progressbar" aria-valuenow={phase.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <span className={styles.fill} style={{ width: `${phase.percent}%` }} />
          </div>
        ) : null}
        <p className={styles.status} aria-live="polite">
          {status ? <StatusChip tone={status.tone}>{status.text}</StatusChip> : null}
        </p>
        <input
          ref={input}
          id={inputId}
          className="hp-visually-hidden"
          type="file"
          accept={accept}
          aria-describedby={`${inputId}-hint`}
          onChange={(event) => choose(event.target.files)}
        />
        <div className={styles.actions}>
          {phase.kind === "failed" && lastFile.current ? (
            <Button variant="secondary" onClick={() => void start(lastFile.current!)}>
              Retry
            </Button>
          ) : null}
          {phase.kind === "idle" || phase.kind === "failed" ? (
            <label htmlFor={inputId} className={styles.browse}>
              Browse files
            </label>
          ) : null}
          {phase.kind === "done" ? (
            <Button variant="tertiary" onClick={reset}>
              {phase.file.status === "READY" ? "Remove" : "Try another file"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
