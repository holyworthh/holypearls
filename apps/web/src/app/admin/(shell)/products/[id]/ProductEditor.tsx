"use client";

import { type AdminProduct, adminProductSchema } from "@holypearls/contracts";
import { Button, Dialog, ErrorSummary, FormField, Notice, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { useState, type FormEvent } from "react";
import { ApiError } from "@holypearls/contracts";
import { api } from "../../../../../lib/api";
import styles from "../../admin-list.module.css";
import { FAMILY_LABELS, MODE_LABELS, STATUS_TONE } from "../labels";

type Target = "PUBLISHED" | "TEMPORARILY_UNAVAILABLE" | "DRAFT" | "ARCHIVED";

const CONFIRM: Record<Target, { title: (name: string) => string; body: string; action: string }> = {
  PUBLISHED: {
    title: (name) => `Publish ${name}?`,
    body: "It goes live on the public site now. Category and search pages refresh within a minute.",
    action: "Publish now",
  },
  TEMPORARILY_UNAVAILABLE: {
    title: (name) => `Mark ${name} temporarily unavailable?`,
    body: "The page stays live but can't be ordered. Accepted quotes and existing orders don't change.",
    action: "Mark unavailable",
  },
  DRAFT: { title: (name) => `Unpublish ${name}?`, body: "It leaves the public site until you publish it again.", action: "Unpublish" },
  ARCHIVED: { title: (name) => `Archive ${name}?`, body: "Archived products can't be published again. Past orders keep their details.", action: "Archive" },
};

const FIELD_IDS: Record<string, string> = {
  name: "product-name",
  summary: "product-summary",
  seoTitle: "product-seo-title",
  searchPhrases: "product-search",
  media: "product-name",
};

/** Product editor with draft and publish (Pen frame 98 · CL3n2, states LL1Z5). */
export function ProductEditor({ initial }: { initial: AdminProduct }) {
  const [product, setProduct] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle ?? "");
  const [phrases, setPhrases] = useState(initial.searchPhrases.join(", "));
  const [buyingMode, setBuyingMode] = useState(initial.buyingMode);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "warning"; title: string; body: string } | null>(null);
  const [confirm, setConfirm] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty =
    name !== product.name ||
    summary !== (product.summary ?? "") ||
    seoTitle !== (product.seoTitle ?? "") ||
    phrases !== product.searchPhrases.join(", ") ||
    buyingMode !== product.buyingMode;

  const handle = (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.body.fieldErrors) setErrors(error.body.fieldErrors);
      if (error.code === "VERSION_CONFLICT") {
        setNotice({ tone: "warning", title: "Someone else saved first", body: "Reload to see their changes, then make yours again." });
      } else if (error.code === "RULE_FAILED") {
        const list = Object.values(error.body.fieldErrors ?? {}).map((text) => text.toLowerCase()).join("; ");
        setNotice({ tone: "error", title: "Not published", body: `Fix these before publishing: ${list}.` });
      } else setNotice({ tone: "error", title: "Something went wrong", body: error.message });
    } else setNotice({ tone: "error", title: "Something went wrong", body: "Try again." });
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    setErrors({});
    setNotice(null);
    setBusy(true);
    try {
      const saved = await api(`/v1/admin/catalogue/products/${product.id}`, {
        method: "PATCH",
        body: {
          version: product.version,
          name,
          summary: summary || null,
          seoTitle: seoTitle || null,
          buyingMode,
          searchPhrases: phrases.split(",").map((item) => item.trim()).filter(Boolean),
        },
        response: adminProductSchema,
      });
      setProduct(saved);
      setNotice({ tone: "success", title: "Draft saved", body: "Recorded in the audit log." });
      return saved;
    } catch (error) {
      handle(error);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (to: Target) => {
    setBusy(true);
    setNotice(null);
    try {
      const current = dirty ? await save() : product;
      if (!current) return;
      const updated = await api(`/v1/admin/catalogue/products/${product.id}/status`, {
        method: "POST",
        body: { to, version: current.version },
        response: adminProductSchema,
      });
      setProduct(updated);
      setNotice({
        tone: "success",
        title: to === "PUBLISHED" ? "Published" : "Status changed",
        body: `${updated.name} is ${updated.status}. Public pages refresh within a minute. Recorded in the audit log.`,
      });
    } catch (error) {
      handle(error);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const summaryErrors = Object.entries(errors).map(([field, message]) => ({ fieldId: FIELD_IDS[field] ?? "product-name", message }));
  const archived = product.status === "ARCHIVED";

  return (
    <div className={styles.columns}>
      <form className={styles.tableCol} noValidate onSubmit={save} aria-label="Product details">
        {summaryErrors.length ? <ErrorSummary errors={summaryErrors} /> : null}
        <section className={styles.panel} aria-labelledby="details-title">
          <h2 id="details-title" className={styles.panelTitle}>
            Details
          </h2>
          <FormField label="Product name" id="product-name" error={errors.name}>
            <TextField value={name} onChange={(event) => setName(event.target.value)} disabled={archived} />
          </FormField>
          <dl className={styles.fields}>
            <dt>Family</dt>
            <dd>{FAMILY_LABELS[product.family]}</dd>
            <dt>Category</dt>
            <dd>{product.categoryName}</dd>
            <dt>SKU</dt>
            <dd className={styles.mono}>{product.sku}</dd>
          </dl>
          <fieldset className={styles.tableCol} disabled={archived}>
            <legend className={styles.panelTitle}>Buying mode</legend>
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <label key={value} className={styles.chips}>
                <input type="radio" name="buyingMode" value={value} checked={buyingMode === value} onChange={() => setBuyingMode(value as AdminProduct["buyingMode"])} />
                {label}
              </label>
            ))}
          </fieldset>
          <FormField label="Search phrases" id="product-search" hint="Comma-separated. Used by site search.">
            <TextField value={phrases} onChange={(event) => setPhrases(event.target.value)} disabled={archived} />
          </FormField>
          <FormField label="Short description" id="product-summary" error={errors.summary}>
            <TextArea value={summary} onChange={(event) => setSummary(event.target.value)} disabled={archived} />
          </FormField>
          <FormField label="SEO title" id="product-seo-title" error={errors.seoTitle}>
            <TextField value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} disabled={archived} />
          </FormField>
          <p className={styles.hint}>
            Images: {product.mediaCount}. Media, specifications, FAQ and related products editing come in the next part of this ticket.
          </p>
        </section>
      </form>

      <aside className={styles.detailCol} aria-label="Publishing">
        <section className={styles.panel} aria-labelledby="publishing-title">
          <h2 id="publishing-title" className={styles.panelTitle}>
            Publishing
          </h2>
          <dl className={styles.fields}>
            <dt>Status</dt>
            <dd>
              <StatusChip tone={STATUS_TONE[product.status]}>{product.status}</StatusChip>
            </dd>
            <dt>Visibility</dt>
            <dd>{product.listed ? "Public once published" : "Link only"}</dd>
          </dl>
          {notice ? (
            <Notice tone={notice.tone} title={notice.title} live>
              <p>{notice.body}</p>
            </Notice>
          ) : null}
          {dirty ? <p className={styles.hint}>Unsaved changes</p> : null}
          {!archived ? (
            <div className={styles.tableCol}>
              {product.status !== "PUBLISHED" ? (
                <Button fullWidth loading={busy} onClick={() => setConfirm("PUBLISHED")}>
                  Publish
                </Button>
              ) : null}
              <Button variant="secondary" fullWidth loading={busy} onClick={() => void save()} disabled={!dirty}>
                Save draft
              </Button>
            </div>
          ) : null}
        </section>
        {!archived ? (
          <section className={styles.panel} aria-labelledby="other-title">
            <h2 id="other-title" className={styles.panelTitle}>
              Other actions
            </h2>
            {product.status === "PUBLISHED" ? (
              <Button variant="tertiary" onClick={() => setConfirm("TEMPORARILY_UNAVAILABLE")}>
                Mark temporarily unavailable
              </Button>
            ) : null}
            {product.status === "PUBLISHED" || product.status === "TEMPORARILY_UNAVAILABLE" ? (
              <Button variant="tertiary" onClick={() => setConfirm("DRAFT")}>
                Unpublish
              </Button>
            ) : null}
            <Button variant="tertiary" onClick={() => setConfirm("ARCHIVED")}>
              Archive product
            </Button>
            <p className={styles.hint}>Every change is written to the audit log.</p>
          </section>
        ) : null}
      </aside>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? CONFIRM[confirm].title(product.name) : ""}
        footer={
          confirm ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant={confirm === "PUBLISHED" ? "primary" : "ink"} loading={busy} onClick={() => void changeStatus(confirm)}>
                {CONFIRM[confirm].action}
              </Button>
            </>
          ) : null
        }
      >
        <p className={styles.hint}>{confirm ? CONFIRM[confirm].body : ""}</p>
      </Dialog>
    </div>
  );
}
