"use client";

import { type AdminProductOptions, adminProductOptionsSchema, type FileView } from "@holypearls/contracts";
import { Button, FormField, TextField } from "@holypearls/ui";
import { FileUpload } from "@holypearls/web-kit/file-upload";
import { api } from "@holypearls/web-kit/api";
import { useEffect, useRef, useState } from "react";
import styles from "../../admin-list.module.css";
import css from "../catalogue.module.css";
import { Thumb } from "./MediaPanel";

type Value = AdminProductOptions["options"][number]["values"][number];

/**
 * A photo per option value (Pen 21's paper cards, a garment colour's photo;
 * owner, 2026-10-05). Each value can have one product-media image with alt
 * text. The product page shows it on the value's card.
 */
export function OptionImagesPanel({ productId, disabled, onError }: { productId: string; disabled: boolean; onError: (error: unknown) => void }) {
  const [options, setOptions] = useState<AdminProductOptions["options"] | null>(null);
  const base = `/v1/admin/catalogue/products/${productId}/options`;
  // The editor's error handler changes on every render; loading runs once per product.
  const reportError = useRef(onError);
  reportError.current = onError;
  useEffect(() => {
    let live = true;
    api(base, { response: adminProductOptionsSchema })
      .then((result) => live && setOptions(result.options))
      .catch((error: unknown) => reportError.current(error));
    return () => {
      live = false;
    };
  }, [base]);

  if (!options || options.length === 0) return null;
  return (
    <>
      <h2 className={styles.panelTitle}>Option images</h2>
      <p className={styles.hint}>A photo for a choice, shown on its card on the product page (paper stocks, colours). Optional.</p>
      {options.map((option) => (
        <fieldset key={option.key} className={css.fieldset}>
          <legend className={styles.panelTitle}>{option.label}</legend>
          <ol className={css.mediaList}>
            {option.values.map((value) => (
              <ValueImage key={value.key} base={`${base}/${option.key}/values/${value.key}/image`} value={value} disabled={disabled} onSaved={(next) => setOptions(next.options)} onError={onError} />
            ))}
          </ol>
        </fieldset>
      ))}
    </>
  );
}

function ValueImage({ base, value, disabled, onSaved, onError }: { base: string; value: Value; disabled: boolean; onSaved: (next: AdminProductOptions) => void; onError: (error: unknown) => void }) {
  const [uploaded, setUploaded] = useState<FileView | null>(null);
  const [alt, setAlt] = useState("");
  const [altError, setAltError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const run = async (call: () => Promise<AdminProductOptions>) => {
    setBusy(true);
    try {
      onSaved(await call());
      setUploaded(null);
      setAlt("");
      setUploadKey((key) => key + 1);
    } catch (failure) {
      onError(failure);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!uploaded) return;
    if (!alt.trim()) return setAltError("Describe the image for people who can't see it");
    setAltError(undefined);
    void run(() => api(base, { method: "PUT", body: { fileId: uploaded.id, alt: alt.trim() }, response: adminProductOptionsSchema }));
  };
  return (
    <li className={css.mediaItem}>
      {value.image ? <Thumb fileId={value.image.fileId} alt={value.image.alt} status={value.image.fileStatus} /> : <div className={css.thumb}><span>No image</span></div>}
      <div className={css.mediaBody}>
        <p className={styles.hint}>{value.label}</p>
        {value.image ? (
          <div className={css.rowActions}>
            <Button variant="tertiary" disabled={disabled || busy} onClick={() => void run(() => api(base, { method: "DELETE", response: adminProductOptionsSchema }))}>
              Remove image<span className="hp-visually-hidden"> for {value.label}</span>
            </Button>
          </div>
        ) : null}
        {!disabled ? (
          <>
            <FileUpload
              key={uploadKey}
              purpose="PRODUCT_MEDIA"
              label={value.image ? `Replace the image for ${value.label}` : `Add an image for ${value.label}`}
              hint="JPEG, PNG or WebP, at least 1600 px wide, up to 20 MB"
              accept="image/jpeg,image/png,image/webp"
              onChange={setUploaded}
            />
            {uploaded ? (
              <>
                <FormField label="Alt text" id={`option-alt-${base}`} error={altError} hint="What the image shows, for screen readers.">
                  <TextField value={alt} onChange={(event) => setAlt(event.target.value)} />
                </FormField>
                <div className={css.rowActions}>
                  <Button loading={busy} onClick={save}>
                    Save image
                  </Button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}
