"use client";

import { type AdminProduct, adminProductSchema, type FileView, fileUrlSchema } from "@holypearls/contracts";
import { Button, FormField, StatusChip, TextField } from "@holypearls/ui";
import { useEffect, useState } from "react";
import { FileUpload } from "../../../../../components/FileUpload";
import { api } from "../../../../../lib/api";
import styles from "../../admin-list.module.css";
import css from "../catalogue.module.css";

interface PanelProps {
  product: AdminProduct;
  disabled: boolean;
  onSaved: (product: AdminProduct) => void;
  onError: (error: unknown) => void;
  error?: string;
}

const FILE_TONE: Record<string, "success" | "info" | "error" | "warning"> = {
  READY: "success",
  PROCESSING: "info",
  REJECTED: "error",
  NEEDS_REVIEW: "warning",
};

/** A short-lived signed thumbnail URL; the worker makes it once the image is checked. */
function Thumb({ fileId, alt, status }: { fileId: string; alt: string; status: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (status !== "READY") return;
    let live = true;
    api(`/v1/files/${fileId}/preview?kind=thumbnail`, { response: fileUrlSchema })
      .then((result) => live && setUrl(result.url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [fileId, status]);
  return <div className={css.thumb}>{url ? <img src={url} alt={alt} /> : <span>{status === "READY" ? "Loading" : status}</span>}</div>;
}

/** Product images (Pen frame 104 media states): upload, alt text, order and removal. */
export function MediaPanel({ product, disabled, onSaved, onError, error }: PanelProps) {
  const [uploaded, setUploaded] = useState<FileView | null>(null);
  const [alt, setAlt] = useState("");
  const [altError, setAltError] = useState<string>();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const base = `/v1/admin/catalogue/products/${product.id}`;

  const run = async (action: () => Promise<AdminProduct>) => {
    setBusy(true);
    try {
      onSaved(await action());
      return true;
    } catch (failure) {
      onError(failure);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!uploaded) return;
    if (!alt.trim()) {
      setAltError("Describe the image for people who can't see it");
      return;
    }
    setAltError(undefined);
    const ok = await run(() => api(`${base}/media`, { method: "POST", body: { fileId: uploaded.id, alt: alt.trim() }, response: adminProductSchema }));
    if (ok) {
      setUploaded(null);
      setAlt("");
      setUploadKey((key) => key + 1);
    }
  };

  const move = (index: number, step: number) => {
    const ids = product.media.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + step, 0, moved!);
    void run(() => api(`${base}/media-order`, { method: "PUT", body: { mediaIds: ids }, response: adminProductSchema }));
  };

  return (
    <>
      <h2 className={styles.panelTitle}>Images</h2>
      <p className={styles.hint}>The first image is the main one on cards and the product page. Images must be at least 1600 px wide.</p>
      {error ? <p className={styles.hint} id="product-media-error">{error}</p> : null}
      {product.media.length === 0 ? <p className={styles.hint}>No images yet. Published products need at least one.</p> : null}
      <ol className={css.mediaList}>
        {product.media.map((item, index) => {
          const text = edits[item.id] ?? item.alt;
          return (
            <li key={item.id} className={css.mediaItem}>
              <Thumb fileId={item.fileId} alt={item.alt} status={item.fileStatus} />
              <div className={css.mediaBody}>
                <StatusChip tone={FILE_TONE[item.fileStatus] ?? "neutral"}>{index === 0 ? `MAIN · ${item.fileStatus}` : item.fileStatus}</StatusChip>
                <FormField label={`Alt text for image ${index + 1}`} id={`media-alt-${item.id}`}>
                  <TextField value={text} disabled={disabled} onChange={(event) => setEdits({ ...edits, [item.id]: event.target.value })} />
                </FormField>
                <div className={css.rowActions}>
                  {text !== item.alt && text.trim() ? (
                    <Button
                      variant="secondary"
                      disabled={disabled || busy}
                      onClick={() => void run(() => api(`${base}/media/${item.id}`, { method: "PATCH", body: { alt: text.trim() }, response: adminProductSchema }))}
                    >
                      Save alt text
                    </Button>
                  ) : null}
                  <Button variant="tertiary" disabled={disabled || busy || index === 0} onClick={() => move(index, -1)}>
                    Move up
                  </Button>
                  <Button variant="tertiary" disabled={disabled || busy || index === product.media.length - 1} onClick={() => move(index, 1)}>
                    Move down
                  </Button>
                  <Button
                    variant="tertiary"
                    disabled={disabled || busy}
                    onClick={() => void run(() => api(`${base}/media/${item.id}`, { method: "DELETE", response: adminProductSchema }))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {!disabled ? (
        <div id="product-media-upload" className={css.fieldset}>
          <FileUpload
            key={uploadKey}
            purpose="PRODUCT_MEDIA"
            label="Drop an image or browse files"
            hint="JPEG, PNG or WebP, at least 1600 px wide, up to 20 MB"
            accept="image/jpeg,image/png,image/webp"
            onChange={setUploaded}
          />
          {uploaded ? (
            <>
              <FormField label="Alt text" id="new-media-alt" error={altError} hint="What the image shows, for screen readers and search.">
                <TextField value={alt} onChange={(event) => setAlt(event.target.value)} />
              </FormField>
              <div className={css.rowActions}>
                <Button loading={busy} onClick={() => void add()}>
                  Add image
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
