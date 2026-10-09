"use client";

import {
  ApiError,
  type AssetVersion,
  type AssetVersionStatus,
  BRAND_ASSET_KIND_LABELS,
  BRAND_ASSET_KINDS,
  type BrandAsset,
  type BrandAssetKind,
  brandAssetSchema,
  type FileView,
  IDEMPOTENCY_KEY_HEADER,
} from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { Download, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { FileUpload } from "../FileUpload";
import { VERSION_STATUS } from "./labels";
import styles from "./workspace.module.css";


const urlSchema = z.object({ url: z.string() });

/** A version's thumbnail, fetched as a short-lived link; a placeholder until the preview exists (PDF, AI and SVG originals are never shown). */
export function AssetThumb({ version, name }: { version: Pick<AssetVersion, "fileId" | "hasThumbnail"> | null; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!version?.hasThumbnail) return;
    let live = true;
    api(`/v1/files/${version.fileId}/preview?kind=thumbnail`, { response: urlSchema })
      .then((result) => live && setSrc(result.url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [version?.fileId, version?.hasThumbnail]);
  return (
    <span className={styles.assetThumb}>
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>}
    </span>
  );
}

export function DownloadButton({ fileId, label = "Download" }: { fileId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await api(`/v1/files/${fileId}/download`, { response: urlSchema });
          window.open(url, "_blank", "noopener");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download aria-hidden className={styles.buttonIcon} />
      {label}
    </Button>
  );
}

/** Upload a new asset (frame 65 "Upload asset"): name, kind and its first file. HolyPearls checks it before production use. */
export function UploadAssetButton({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BrandAssetKind>("LOGO");
  const [file, setFile] = useState<FileView | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newIdempotencyKey());

  const save = async () => {
    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = "Name the asset, for example Primary Logo";
    if (!file) problems.fileId = "Upload the file first";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const asset = await api(`/v1/organizations/${organizationId}/assets`, { method: "POST", body: { name, kind, fileId: file!.id }, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: brandAssetSchema });
      window.location.assign(`/workspace/${organizationId}/assets/${asset.id}`);
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setFailure(error instanceof ApiError && error.code === "FORBIDDEN" ? "Only Owners and Admins can add brand assets." : "We couldn't add the asset. Try again.");
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Upload aria-hidden className={styles.buttonIcon} />
        Upload asset
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Upload a brand asset"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              Add asset
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          {failure ? (
            <Notice tone="error" live>
              <p>{failure}</p>
            </Notice>
          ) : null}
          <FormField id="asset-name" label="Name" error={errors.name}>
            <TextField value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <FormField id="asset-kind" label="Kind">
            <Select value={kind} onChange={(event) => setKind(event.target.value as BrandAssetKind)} options={BRAND_ASSET_KINDS.map((value) => ({ value, label: BRAND_ASSET_KIND_LABELS[value] }))} />
          </FormField>
          <FileUpload purpose="BRAND_ASSET" label="Drop the file or browse" onUploaded={setFile} onChange={(next) => setFile(next)} />
          {errors.fileId ? (
            <p className={styles.dialogText} role="alert">
              {errors.fileId}
            </p>
          ) : null}
          <p className={styles.dialogText}>HolyPearls checks every new file for print and embroidery before it can be used in production.</p>
        </div>
      </Dialog>
    </>
  );
}

const USABLE: readonly AssetVersionStatus[] = ["PRODUCTION_READY", "SUPERSEDED"];

/**
 * Asset detail (frame 66): the current version, history and actions.
 * Replacing adds a new version and keeps every earlier one (B2B-FR-023).
 * Retiring asks first (frame 67): new orders can't use it, past orders keep it.
 */
export function AssetDetail({ organizationId, initial }: { organizationId: string; initial: BrandAsset }) {
  const [asset, setAsset] = useState(initial);
  const [replacing, setReplacing] = useState(false);
  const [file, setFile] = useState<FileView | null>(null);
  const [confirm, setConfirm] = useState<{ version: AssetVersion; action: "retire" | "archive" } | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const current = asset.versions.find((version) => version.status === "PRODUCTION_READY") ?? null;
  const shown = current ?? asset.versions[0]!;
  const base = `/v1/organizations/${organizationId}/assets/${asset.id}`;

  const replace = async () => {
    if (!file) return;
    setBusy(true);
    try {
      setAsset(await api(`${base}/versions`, { method: "POST", body: { fileId: file.id }, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: brandAssetSchema }));
      setReplacing(false);
      setFile(null);
      setKey(newIdempotencyKey());
      setNotice({ tone: "success", text: "New version added. HolyPearls checks it before it's used; the current version stays in use until then." });
    } catch {
      setNotice({ tone: "error", text: "We couldn't add the new version. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const change = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      setAsset(await api(`${base}/versions/${confirm.version.id}/${confirm.action}`, { method: "POST", response: brandAssetSchema }));
      setNotice({ tone: "success", text: confirm.action === "retire" ? `V${confirm.version.number} is retired. New orders can't use it; past orders keep it.` : `V${confirm.version.number} is archived. It stays in your history.` });
    } catch (error) {
      setNotice({ tone: "error", text: errorReason(error) === "NOT_IN_USE" ? "Only a version in use can be retired." : "That didn't work. Reload the page and try again." });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <>
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>{BRAND_ASSET_KIND_LABELS[asset.kind]}</p>
          <h1 className={styles.title}>{asset.name}</h1>
        </div>
        <div className={styles.quickActions}>
          <DownloadButton fileId={shown.fileId} />
          {asset.canManage ? <Button onClick={() => setReplacing(true)}>Replace version</Button> : null}
        </div>
      </div>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      <div className={styles.assetDetail}>
        <section className={styles.panel} aria-label="Current version">
          <div className={styles.assetHero}>
            <AssetThumb version={shown} name={asset.name} />
          </div>
          <p className={styles.emptyRow}>
            V{shown.number} · {current ? "current" : "not yet production ready"} · {shown.fileName}
          </p>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              Used in {asset.templates.length} {asset.templates.length === 1 ? "template" : "templates"}
            </h2>
          </div>
          {asset.templates.length ? (
            <ul className={styles.rows}>
              {asset.templates.map((template) => (
                <li key={template.id} className={styles.row}>
                  <div className={styles.rowText}>
                    <a className={styles.rowLink} href={`/workspace/${organizationId}/templates/${template.id}`}>
                      {template.name}
                    </a>
                    <span className={styles.rowMeta}>Uses V{template.number}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyRow}>No templates use this asset yet.</p>
          )}
        </section>
        <section className={styles.panel} aria-labelledby="versions-title">
          <div className={styles.panelHead}>
            <h2 id="versions-title" className={styles.panelTitle}>
              Versions
            </h2>
          </div>
          <ul className={styles.rows}>
            {asset.versions.map((version) => (
              <li key={version.id} className={styles.row}>
                <div className={styles.rowText}>
                  <span className={styles.rowTitle}>V{version.number}</span>
                  <span className={styles.rowMeta}>
                    {version.status === "PROCESSING"
                      ? "Uploaded · the file is being checked"
                      : version.status === "NEEDS_REVIEW"
                        ? `Uploaded${version.uploadedBy ? ` by ${version.uploadedBy}` : ""} · HolyPearls check pending`
                        : version.status === "PRODUCTION_READY"
                          ? "Production ready · print and embroidery"
                          : version.status === "SUPERSEDED"
                            ? "Replaced by a newer version · still usable until retired"
                            : version.status === "RETIRED"
                              ? "Retired for new orders · past orders keep it"
                              : "Archived · kept in history"}
                  </span>
                  {version.reviewNote ? <span className={styles.rowMeta}>HolyPearls: {version.reviewNote}</span> : null}
                </div>
                <StatusChip tone={VERSION_STATUS[version.status].tone}>{VERSION_STATUS[version.status].label}</StatusChip>
                {asset.canManage && USABLE.includes(version.status) ? (
                  <button type="button" className={styles.textButton} onClick={() => setConfirm({ version, action: "retire" })}>
                    Retire<span className="hp-visually-hidden"> V{version.number}</span>
                  </button>
                ) : null}
                {asset.canManage && version.status !== "ARCHIVED" ? (
                  <button type="button" className={styles.textButton} onClick={() => setConfirm({ version, action: "archive" })}>
                    Archive<span className="hp-visually-hidden"> V{version.number}</span>
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className={styles.emptyRow}>Past orders keep pointing at the exact version they used.</p>
        </section>
      </div>

      <Dialog
        open={replacing}
        onClose={() => setReplacing(false)}
        title={`Replace ${asset.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReplacing(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!file} onClick={() => void replace()}>
              Add V{asset.versions[0]!.number + 1}
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <FileUpload purpose="BRAND_ASSET" label="Drop the new file or browse" onUploaded={setFile} onChange={(next) => setFile(next)} />
          <p className={styles.dialogText}>This adds V{asset.versions[0]!.number + 1}. V{shown.number} stays exactly as it is and stays in use until HolyPearls marks the new version production ready.</p>
        </div>
      </Dialog>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? (confirm.action === "retire" ? `Retire V${confirm.version.number} for new orders?` : `Archive V${confirm.version.number}?`) : ""}
        footer={
          confirm ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant="destructive" loading={busy} onClick={() => void change()}>
                {confirm.action === "retire" ? `Retire V${confirm.version.number} for new use` : `Archive V${confirm.version.number}`}
              </Button>
            </>
          ) : null
        }
      >
        {confirm ? (
          <p className={styles.dialogText}>
            {confirm.action === "retire"
              ? `Retiring V${confirm.version.number} means new orders can't use it. Orders already placed keep it, and it stays in your history.${(() => {
                  const affected = asset.templates.filter((template) => template.number === confirm.version.number && template.status !== "ARCHIVED").length;
                  return affected ? ` ${affected} ${affected === 1 ? "template" : "templates"} will need review before the next order.` : "";
                })()}`
              : `Archived versions stay in your history and can't be deleted. New orders can't use them.`}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
