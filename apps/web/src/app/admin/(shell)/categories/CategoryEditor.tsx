"use client";

import { type AdminCategory, ApiError, adminCategorySchema, type FileView } from "@holypearls/contracts";
import { Button, Dialog, ErrorSummary, FormField, Notice, Select, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FileUpload } from "../../../../components/FileUpload";
import { api } from "../../../../lib/api";
import styles from "../admin-list.module.css";
import css from "../products/catalogue.module.css";

const TONE = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "neutral" } as const;
const FIELD_IDS: Record<string, string> = {
  name: "category-name",
  slug: "category-slug",
  parentId: "category-parent",
  seoTitle: "category-seo-title",
  seoDescription: "category-seo-description",
  heroFileId: "category-hero",
};

const toSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

interface Props {
  category: AdminCategory | null;
  parents: AdminCategory[];
}

/** Category editor panel (Pen frame 104): details, hero image, publish and archive. */
export function CategoryEditor({ category, parents }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(category);
  const [form, setForm] = useState({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    parentId: category?.parentId ?? "",
    description: category?.description ?? "",
    seoTitle: category?.seoTitle ?? "",
    seoDescription: category?.seoDescription ?? "",
  });
  const [hero, setHero] = useState<FileView | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "warning"; title: string; body: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((state) => ({ ...state, [key]: value, ...(key === "name" && !category ? { slug: toSlug(value) } : {}) }));
  const archived = current?.status === "ARCHIVED";

  const fail = (error: unknown, title = "Not saved") => {
    if (error instanceof ApiError) {
      if (error.body.fieldErrors) setErrors(error.body.fieldErrors);
      setNotice({
        tone: error.code === "VERSION_CONFLICT" ? "warning" : "error",
        title: error.code === "VERSION_CONFLICT" ? "Someone else saved first" : title,
        body: error.code === "VERSION_CONFLICT" ? "Reload to see their changes, then make yours again." : error.message,
      });
    } else setNotice({ tone: "error", title, body: "Something went wrong. Try again." });
  };

  const body = () => ({
    name: form.name,
    slug: form.slug,
    parentId: form.parentId || null,
    description: form.description || null,
    seoTitle: form.seoTitle || null,
    seoDescription: form.seoDescription || null,
    ...(hero ? { heroFileId: hero.id } : {}),
  });

  const save = async (publish: boolean) => {
    setErrors({});
    setNotice(null);
    setBusy(true);
    try {
      let saved = current
        ? await api(`/v1/admin/catalogue/categories/${current.id}`, { method: "PATCH", body: { ...body(), version: current.version }, response: adminCategorySchema })
        : await api("/v1/admin/catalogue/categories", { method: "POST", body: body(), response: adminCategorySchema });
      if (publish && saved.status === "DRAFT") {
        saved = await api(`/v1/admin/catalogue/categories/${saved.id}/status`, { method: "POST", body: { to: "PUBLISHED", version: saved.version }, response: adminCategorySchema });
      }
      setCurrent(saved);
      setNotice(
        publish
          ? { tone: "success", title: "Category published", body: `${saved.name} pages refreshed (cache tags). Recorded in the audit log.` }
          : { tone: "success", title: "Saved", body: "Recorded in the audit log." },
      );
      if (!category) router.push(`/admin/categories?id=${saved.id}`);
      else router.refresh();
    } catch (error) {
      fail(error, publish ? "Not published" : "Not saved");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const saved = await api(`/v1/admin/catalogue/categories/${current.id}/status`, {
        method: "POST",
        body: { to: "ARCHIVED", version: current.version },
        response: adminCategorySchema,
      });
      setCurrent(saved);
      setNotice({ tone: "warning", title: "Archived category", body: `${saved.name} is off the site. History is kept.` });
      router.refresh();
    } catch (error) {
      fail(error, "Not archived");
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  const summary = Object.entries(errors).map(([field, message]) => ({ fieldId: FIELD_IDS[field] ?? "category-name", message }));
  return (
    <section className={styles.panel} aria-labelledby="category-editor-title">
      <h2 id="category-editor-title" className={styles.panelTitle}>
        {current ? current.name : "New category"}
      </h2>
      {current ? (
        <a className={styles.action} href={`/admin/categories/${current.id}/hub`}>
          Edit hub page sections →
        </a>
      ) : null}
      {current ? (
        <p className={styles.chips}>
          <StatusChip tone={TONE[current.status]}>{current.status}</StatusChip>
          <span>
            {current.productCount} {current.productCount === 1 ? "product" : "products"}
          </span>
        </p>
      ) : null}
      {notice ? (
        <Notice tone={notice.tone} title={notice.title} live>
          <p>{notice.body}</p>
        </Notice>
      ) : null}
      {summary.length ? <ErrorSummary errors={summary} /> : null}
      <form noValidate onSubmit={submit} className={styles.tableCol} aria-label="Category details">
        <fieldset className={css.fieldset} disabled={archived}>
          <FormField label="Name" id="category-name" error={errors.name}>
            <TextField value={form.name} onChange={(event) => set("name", event.target.value)} />
          </FormField>
          <FormField label="Parent" id="category-parent" error={errors.parentId} hint="Leave empty for a top-level category.">
            <Select
              value={form.parentId}
              onChange={(event) => set("parentId", event.target.value)}
              options={[{ value: "", label: "None (top level)" }, ...parents.filter((parent) => parent.id !== current?.id).map((parent) => ({ value: parent.id, label: parent.name }))]}
            />
          </FormField>
          <FormField label="Page address" id="category-slug" error={errors.slug} hint={`/categories/${form.slug || "…"}`}>
            <TextField value={form.slug} onChange={(event) => set("slug", event.target.value)} />
          </FormField>
          <FormField label="Description" id="category-description">
            <TextArea value={form.description} onChange={(event) => set("description", event.target.value)} />
          </FormField>
          <FormField label="SEO title" id="category-seo-title" error={errors.seoTitle} hint="Canonical is set automatically to this category page.">
            <TextField value={form.seoTitle} maxLength={70} onChange={(event) => set("seoTitle", event.target.value)} />
          </FormField>
          <FormField label="SEO description" id="category-seo-description" error={errors.seoDescription}>
            <TextArea value={form.seoDescription} maxLength={170} onChange={(event) => set("seoDescription", event.target.value)} />
          </FormField>
          <div id="category-hero" className={css.fieldset}>
            <p className={styles.panelTitle}>Hero image</p>
            {current?.heroFileId && !hero ? <p className={styles.hint}>A hero image is set. Upload a new one to replace it.</p> : null}
            {!archived ? (
              <FileUpload
                purpose="PRODUCT_MEDIA"
                label="Drop an image or browse files"
                hint="JPEG, PNG or WebP, at least 1600 px wide, up to 20 MB"
                accept="image/jpeg,image/png,image/webp"
                onChange={setHero}
              />
            ) : null}
          </div>
        </fieldset>
        {!archived ? (
          <div className={css.rowActions}>
            {current ? (
              <Button variant="secondary" disabled={busy} onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            ) : null}
            <Button type="submit" variant="secondary" loading={busy}>
              {current ? "Save" : "Save draft"}
            </Button>
            {current?.status !== "PUBLISHED" ? (
              <Button loading={busy} onClick={() => void save(true)}>
                Save and publish
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>
      <Dialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive category"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button variant="ink" loading={busy} onClick={() => void archive()}>
              Archive
            </Button>
          </>
        }
      >
        <p className={styles.hint}>
          Archive {current?.name}? It has {current?.productCount ?? 0} {current?.productCount === 1 ? "product" : "products"} and disappears from the site. History is kept.
        </p>
      </Dialog>
    </section>
  );
}
