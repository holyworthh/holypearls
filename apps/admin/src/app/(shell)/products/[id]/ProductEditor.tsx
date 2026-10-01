"use client";

import { type AdminCategory, type AdminProduct, ApiError, adminProductSchema } from "@holypearls/contracts";
import { Button, Dialog, ErrorSummary, FormField, Notice, Select, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api } from "@holypearls/web-kit/api";
import styles from "../../admin-list.module.css";
import css from "../catalogue.module.css";
import { DECORATION_LABELS, ROUTE_LABELS } from "@holypearls/web-kit/catalogue-labels";
import { FAMILY_LABELS, MODE_LABELS, STATUS_TONE } from "../labels";
import { MediaPanel } from "./MediaPanel";
import { RelatedPanel } from "./RelatedPanel";

type Target = "PUBLISHED" | "TEMPORARILY_UNAVAILABLE" | "ARCHIVED";
type Tab = "details" | "media" | "content" | "seo" | "related";
type Pair<A extends string, B extends string> = Record<A | B, string>;

const TABS: { value: Tab; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "media", label: "Media" },
  { value: "content", label: "Specifications & FAQ" },
  { value: "seo", label: "SEO" },
  { value: "related", label: "Related" },
];

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
  ARCHIVED: {
    title: (name) => `Archive ${name}?`,
    body: "It leaves the public site and can't be published again. Past orders keep their details.",
    action: "Archive",
  },
};

/** Which tab and field each server error belongs to. */
const FIELDS: Record<string, { id: string; tab: Tab }> = {
  name: { id: "product-name", tab: "details" },
  family: { id: "product-family", tab: "details" },
  categoryId: { id: "product-category", tab: "details" },
  summary: { id: "product-summary", tab: "details" },
  description: { id: "product-description", tab: "details" },
  searchPhrases: { id: "product-search", tab: "details" },
  routes: { id: "product-routes", tab: "details" },
  decorations: { id: "product-decorations", tab: "details" },
  media: { id: "product-media-upload", tab: "media" },
  seoTitle: { id: "product-seo-title", tab: "seo" },
  seoDescription: { id: "product-seo-description", tab: "seo" },
  slug: { id: "product-slug", tab: "seo" },
};

const joinPhrases = (phrases: string[]) => phrases.join(", ");
const splitPhrases = (text: string) =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Draft {
  name: string;
  family: AdminProduct["family"];
  categoryId: string;
  buyingMode: AdminProduct["buyingMode"];
  phrases: string;
  routes: AdminProduct["routes"];
  decorations: AdminProduct["decorations"];
  summary: string;
  description: string;
  specifications: Pair<"label", "value">[];
  faqs: Pair<"question", "answer">[];
  seoTitle: string;
  seoDescription: string;
  slug: string;
}

const draftOf = (product: AdminProduct): Draft => ({
  name: product.name,
  family: product.family,
  categoryId: product.categoryId,
  buyingMode: product.buyingMode,
  phrases: joinPhrases(product.searchPhrases),
  routes: product.routes,
  decorations: product.decorations,
  summary: product.summary ?? "",
  description: product.description ?? "",
  specifications: product.specifications,
  faqs: product.faqs,
  seoTitle: product.seoTitle ?? "",
  seoDescription: product.seoDescription ?? "",
  slug: product.slug,
});

/** Product editor with draft and publish (Pen frame 98 · CL3n2, states LL1Z5; media per frame 104). */
export function ProductEditor({ initial, categories }: { initial: AdminProduct; categories: AdminCategory[] }) {
  const [product, setProduct] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [tab, setTab] = useState<Tab>("details");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "warning"; title: string; body: string } | null>(null);
  const [confirm, setConfirm] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const saved = draftOf(product);
  const dirty = !same(draft, saved);
  const archived = product.status === "ARCHIVED";

  const handle = (error: unknown) => {
    if (error instanceof ApiError) {
      const fieldErrors = error.body.fieldErrors ?? {};
      setErrors(fieldErrors);
      const first = Object.keys(fieldErrors)[0];
      if (first && FIELDS[first]) setTab(FIELDS[first].tab);
      if (error.code === "VERSION_CONFLICT") {
        setNotice({ tone: "warning", title: "Someone else saved first", body: "Reload to see their changes, then make yours again." });
      } else if (error.code === "RULE_FAILED" && Object.keys(fieldErrors).length) {
        const list = Object.values(fieldErrors).map((text) => text.toLowerCase()).join("; ");
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
      const next = await api(`/v1/admin/catalogue/products/${product.id}`, {
        method: "PATCH",
        body: {
          version: product.version,
          name: draft.name,
          family: draft.family,
          categoryId: draft.categoryId,
          buyingMode: draft.buyingMode,
          searchPhrases: splitPhrases(draft.phrases),
          routes: draft.routes,
          decorations: draft.decorations,
          summary: draft.summary || null,
          description: draft.description || null,
          specifications: draft.specifications.filter((row) => row.label.trim() || row.value.trim()),
          faqs: draft.faqs.filter((row) => row.question.trim() || row.answer.trim()),
          seoTitle: draft.seoTitle || null,
          seoDescription: draft.seoDescription || null,
          slug: draft.slug,
        },
        response: adminProductSchema,
      });
      setProduct(next);
      setDraft(draftOf(next));
      setNotice({ tone: "success", title: "Draft saved", body: "Recorded in the audit log." });
      return next;
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

  /** Media and related products save straight away; keep any unsaved text edits. */
  const applied = (next: AdminProduct) => {
    setProduct((current) => ({ ...next, version: Math.max(next.version, current.version) }));
    setNotice({ tone: "success", title: "Saved", body: "Recorded in the audit log." });
  };

  const onTabKey = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + TABS.length) % TABS.length;
    setTab(TABS[next]!.value);
    tabRefs.current[next]?.focus();
  };

  const summaryErrors = Object.entries(errors).map(([field, message]) => ({ fieldId: FIELDS[field]?.id ?? "product-name", message }));
  const categoryOptions = categories
    .filter((category) => category.status !== "ARCHIVED" || category.id === product.categoryId)
    .map((category) => ({ value: category.id, label: category.parentName ? `${category.parentName} › ${category.name}` : category.name }));

  const updateRow = <T extends Record<string, string>>(key: "specifications" | "faqs", index: number, field: keyof T, value: string) =>
    set(
      key,
      (draft[key] as unknown as T[]).map((row, position) => (position === index ? { ...row, [field]: value } : row)) as never,
    );
  const removeRow = (key: "specifications" | "faqs", index: number) => set(key, draft[key].filter((_, position) => position !== index) as never);

  return (
    <div className={styles.columns}>
      <div className={styles.tableCol}>
        <div className={css.tabs} role="tablist" aria-label="Product sections">
          {TABS.map((item, index) => (
            <button
              key={item.value}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`product-tab-${item.value}`}
              aria-selected={tab === item.value}
              aria-controls={`product-panel-${item.value}`}
              tabIndex={tab === item.value ? 0 : -1}
              className={css.tab}
              onClick={() => setTab(item.value)}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {summaryErrors.length ? <ErrorSummary errors={summaryErrors} /> : null}

        <form noValidate onSubmit={save} aria-label="Product" className={styles.tableCol}>
          <fieldset className={css.fieldset} disabled={archived}>
            <section
              className={styles.panel}
              role="tabpanel"
              id="product-panel-details"
              aria-labelledby="product-tab-details"
              hidden={tab !== "details"}
            >
              <FormField label="Product name" id="product-name" error={errors.name}>
                <TextField value={draft.name} onChange={(event) => set("name", event.target.value)} />
              </FormField>
              <div className={css.pair}>
                <FormField label="Family" id="product-family" error={errors.family}>
                  <Select
                    value={draft.family}
                    onChange={(event) => set("family", event.target.value as Draft["family"])}
                    options={Object.entries(FAMILY_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </FormField>
                <FormField label="Category" id="product-category" error={errors.categoryId}>
                  <Select value={draft.categoryId} onChange={(event) => set("categoryId", event.target.value)} options={categoryOptions} />
                </FormField>
              </div>
              <fieldset className={css.fieldset}>
                <legend className={styles.panelTitle}>Buying mode</legend>
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <label key={value} className={css.radio}>
                    <input
                      type="radio"
                      name="buyingMode"
                      value={value}
                      checked={draft.buyingMode === value}
                      onChange={() => set("buyingMode", value as Draft["buyingMode"])}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              {(
                [
                  ["routes", "How it's made", ROUTE_LABELS, "product-routes"],
                  ["decorations", "Decoration", DECORATION_LABELS, "product-decorations"],
                ] as const
              ).map(([key, title, labels, id]) => (
                <fieldset key={key} className={css.fieldset} id={id}>
                  <legend className={styles.panelTitle}>{title}</legend>
                  <p className={css.hint}>Directory filters. Leave empty if it doesn&apos;t apply.</p>
                  {Object.entries(labels).map(([value, label]) => {
                    const list = draft[key] as string[];
                    return (
                      <label key={value} className={css.radio}>
                        <input
                          type="checkbox"
                          value={value}
                          checked={list.includes(value)}
                          onChange={(event) =>
                            set(key, (event.target.checked ? [...list, value] : list.filter((item) => item !== value)) as never)
                          }
                        />
                        {label}
                      </label>
                    );
                  })}
                  {errors[key] ? <p className={css.error}>{errors[key]}</p> : null}
                </fieldset>
              ))}
              <FormField label="Search phrases" id="product-search" hint="Comma-separated. Used by site search." error={errors.searchPhrases}>
                <TextField value={draft.phrases} onChange={(event) => set("phrases", event.target.value)} />
              </FormField>
              <FormField label="Short description" id="product-summary" error={errors.summary} hint="Shown on cards and at the top of the product page.">
                <TextArea value={draft.summary} onChange={(event) => set("summary", event.target.value)} />
              </FormField>
              <FormField label="Full description" id="product-description" error={errors.description}>
                <TextArea value={draft.description} onChange={(event) => set("description", event.target.value)} rows={6} />
              </FormField>
              <dl className={styles.fields}>
                <dt>SKU</dt>
                <dd className={styles.mono}>{product.sku}</dd>
              </dl>
            </section>

            <section className={styles.panel} role="tabpanel" id="product-panel-content" aria-labelledby="product-tab-content" hidden={tab !== "content"}>
              <h2 className={styles.panelTitle}>Specifications</h2>
              {draft.specifications.map((row, index) => (
                <div key={index} className={css.pairRow}>
                  <div className={css.pair}>
                    <FormField label={`Label ${index + 1}`} id={`spec-label-${index}`}>
                      <TextField value={row.label} onChange={(event) => updateRow("specifications", index, "label", event.target.value)} />
                    </FormField>
                    <FormField label={`Value ${index + 1}`} id={`spec-value-${index}`}>
                      <TextField value={row.value} onChange={(event) => updateRow("specifications", index, "value", event.target.value)} />
                    </FormField>
                  </div>
                  <div className={css.rowActions}>
                    <Button variant="tertiary" onClick={() => removeRow("specifications", index)}>
                      Remove specification {index + 1}
                    </Button>
                  </div>
                </div>
              ))}
              <div className={css.rowActions}>
                <Button variant="secondary" onClick={() => set("specifications", [...draft.specifications, { label: "", value: "" }])}>
                  Add specification
                </Button>
              </div>
              <h2 className={styles.panelTitle}>Questions and answers</h2>
              {draft.faqs.map((row, index) => (
                <div key={index} className={css.pairRow}>
                  <FormField label={`Question ${index + 1}`} id={`faq-question-${index}`}>
                    <TextField value={row.question} onChange={(event) => updateRow("faqs", index, "question", event.target.value)} />
                  </FormField>
                  <FormField label={`Answer ${index + 1}`} id={`faq-answer-${index}`}>
                    <TextArea value={row.answer} onChange={(event) => updateRow("faqs", index, "answer", event.target.value)} />
                  </FormField>
                  <div className={css.rowActions}>
                    <Button variant="tertiary" onClick={() => removeRow("faqs", index)}>
                      Remove question {index + 1}
                    </Button>
                  </div>
                </div>
              ))}
              <div className={css.rowActions}>
                <Button variant="secondary" onClick={() => set("faqs", [...draft.faqs, { question: "", answer: "" }])}>
                  Add question
                </Button>
              </div>
            </section>

            <section className={styles.panel} role="tabpanel" id="product-panel-seo" aria-labelledby="product-tab-seo" hidden={tab !== "seo"}>
              <FormField label="SEO title" id="product-seo-title" error={errors.seoTitle} hint={`${draft.seoTitle.length} of 70 characters`}>
                <TextField value={draft.seoTitle} maxLength={70} onChange={(event) => set("seoTitle", event.target.value)} />
              </FormField>
              <FormField label="SEO description" id="product-seo-description" error={errors.seoDescription} hint={`${draft.seoDescription.length} of 170 characters`}>
                <TextArea value={draft.seoDescription} maxLength={170} onChange={(event) => set("seoDescription", event.target.value)} />
              </FormField>
              <FormField
                label="Page address"
                id="product-slug"
                error={errors.slug}
                hint={product.status === "DRAFT" ? `/products/${draft.slug}` : `/products/${draft.slug}. Changing it on a live page breaks old links.`}
              >
                <TextField value={draft.slug} onChange={(event) => set("slug", event.target.value)} />
              </FormField>
              <p className={styles.hint}>The canonical address is set automatically to this product page.</p>
            </section>
          </fieldset>
        </form>

        <section className={styles.panel} role="tabpanel" id="product-panel-media" aria-labelledby="product-tab-media" hidden={tab !== "media"}>
          <MediaPanel product={product} disabled={archived} onSaved={applied} onError={handle} error={errors.media} />
        </section>
        <section className={styles.panel} role="tabpanel" id="product-panel-related" aria-labelledby="product-tab-related" hidden={tab !== "related"}>
          <RelatedPanel product={product} disabled={archived} onSaved={applied} onError={handle} />
        </section>
      </div>

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
            <dt>Images</dt>
            <dd>{product.media.length}</dd>
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
                {product.status === "DRAFT" ? "Save draft" : "Save changes"}
              </Button>
            </div>
          ) : (
            <p className={styles.hint}>Archived products can&apos;t be edited or published again.</p>
          )}
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
            <Button variant="tertiary" onClick={() => setConfirm("ARCHIVED")}>
              Archive product
            </Button>
            <p className={styles.hint}>To take a product off the site, archive it. Every change is written to the audit log.</p>
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
