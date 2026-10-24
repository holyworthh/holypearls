"use client";

import { type AdminCategory, ApiError, adminProductSchema, createProductSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, ErrorSummary, FormField, Select, TextField } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@holypearls/web-kit/api";
import styles from "../../admin-list.module.css";
import css from "../catalogue.module.css";
import { FAMILY_LABELS, MODE_LABELS } from "../labels";
import { toSlug } from "../../format";


const FIELD_IDS: Record<string, string> = {
  name: "new-name",
  sku: "new-sku",
  slug: "new-slug",
  family: "new-family",
  categoryId: "new-category",
  buyingMode: "new-mode",
};

export function NewProductForm({ categories }: { categories: AdminCategory[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", sku: "", slug: "", family: "", categoryId: "", buyingMode: "SIMPLE_CONFIGURABLE" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value, ...(key === "name" && !slugTouched ? { slug: toSlug(value) } : {}) }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = createProductSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const product = await api("/v1/admin/catalogue/products", { method: "POST", body: parsed.data, response: adminProductSchema });
      router.push(`/products/${product.id}`);
    } catch (error) {
      setErrors(error instanceof ApiError && error.body.fieldErrors ? error.body.fieldErrors : { name: "Something went wrong. Try again." });
      setBusy(false);
    }
  };

  const summary = Object.entries(errors).map(([field, message]) => ({ fieldId: FIELD_IDS[field] ?? "new-name", message }));
  return (
    <form className={styles.panel} noValidate onSubmit={submit} aria-label="New product">
      {summary.length ? <ErrorSummary errors={summary} /> : null}
      <FormField label="Product name" id="new-name" error={errors.name}>
        <TextField value={form.name} onChange={(event) => set("name", event.target.value)} />
      </FormField>
      <div className={css.pair}>
        <FormField label="SKU" id="new-sku" error={errors.sku} hint="Catalogue reference, for example HP-PRN-012.">
          <TextField value={form.sku} onChange={(event) => set("sku", event.target.value.toUpperCase())} />
        </FormField>
        <FormField label="Page address" id="new-slug" error={errors.slug} hint={`/products/${form.slug || "…"}`}>
          <TextField
            value={form.slug}
            onChange={(event) => {
              setSlugTouched(true);
              set("slug", event.target.value);
            }}
          />
        </FormField>
      </div>
      <div className={css.pair}>
        <FormField label="Family" id="new-family" error={errors.family}>
          <Select
            value={form.family}
            placeholder="Choose a family"
            onValueChange={(next) => set("family", next)}
            options={Object.entries(FAMILY_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </FormField>
        <FormField label="Category" id="new-category" error={errors.categoryId}>
          <Select
            value={form.categoryId}
            placeholder="Choose a category"
            onValueChange={(next) => set("categoryId", next)}
            options={categories.map((category) => ({ value: category.id, label: category.parentName ? `${category.parentName} › ${category.name}` : category.name }))}
          />
        </FormField>
      </div>
      <FormField label="Buying mode" id="new-mode" error={errors.buyingMode}>
        <Select value={form.buyingMode} onValueChange={(next) => set("buyingMode", next)} options={Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label }))} />
      </FormField>
      <p className={styles.hint}>It starts as a DRAFT. Add images, descriptions and SEO text before publishing.</p>
      <div className={css.rowActions}>
        <Button type="submit" loading={busy}>
          Create draft
        </Button>
      </div>
    </form>
  );
}
