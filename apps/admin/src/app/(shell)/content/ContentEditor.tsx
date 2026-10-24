"use client";

import { siteUrl } from "@/lib/site";
import {
  type AdminContentPage,
  adminContentPageSchema,
  ApiError,
  CONTENT_PATH,
  CONTENT_TYPE_LABEL,
  contentHref,
  type ContentFields,
  type FileView,
  searchTargetOptionsSchema,
} from "@holypearls/contracts";
import { Button, ButtonLink, Dialog, ErrorSummary, FormField, Notice, Select, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { FileUpload } from "@holypearls/web-kit/file-upload";
import { api } from "@holypearls/web-kit/api";
import { z } from "zod";
import { formatTime } from "../format";
import c from "./content-admin.module.css";
import { PartsEditor } from "./PartsEditor";
import { PARTS } from "./parts";
import { RichTextEditor, staffMediaUrl } from "./RichTextEditor";

const TONE = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "neutral" } as const;
const SINGULAR = { PROJECT: "project page", GUIDE: "guide", CASE_STUDY: "case study", ABOUT: "About page" } as const;

const FIELD_IDS: Record<string, string> = {
  title: "content-title",
  slug: "content-slug",
  summary: "content-summary",
  body: "content-body",
  seoTitle: "content-seo-title",
  seoDescription: "content-seo-description",
  canonicalPath: "content-canonical",
  heroFileId: "content-hero",
  heroAlt: "content-hero-alt",
  linkedProductIds: "content-linked-products",
  linkedPageIds: "content-linked-pages",
  position: "content-position",
};
const fieldId = (key: string) => FIELD_IDS[key] ?? (key.startsWith("data.") ? `part-${key.replaceAll(".", "-")}` : "content-title");

type Linked = { id: string; label: string };
type Banner = { tone: "success" | "error" | "warning" | "info"; title: string; body: string };

function removedText(removed: NonNullable<AdminContentPage["sanitized"]>) {
  const parts = [
    removed.scripts ? (removed.scripts === 1 ? "a <script> block" : `${removed.scripts} <script> blocks`) : null,
    removed.handlers ? (removed.handlers === 1 ? "an inline event handler" : `${removed.handlers} inline event handlers`) : null,
    removed.other ? (removed.other === 1 ? "one other unsafe element" : `${removed.other} other unsafe elements`) : null,
  ].filter(Boolean);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `We removed ${list} from pasted content. Only safe formatting is kept.`;
}

/** Picks products or pages to link, using the search-phrase target lookup. */
function LinkPicker({ id, label, kind, value, onChange, error }: { id: string; label: string; kind: "PRODUCT" | "PAGE"; value: Linked[]; onChange: (next: Linked[]) => void; error?: string }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Linked[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) return setOptions([]);
    const timer = setTimeout(() => {
      api(`/v1/admin/search/targets?q=${encodeURIComponent(q)}`, { response: searchTargetOptionsSchema })
        .then((result) => setOptions(result.entries.filter((entry) => entry.type === kind && !value.some((item) => item.id === entry.id)).map((entry) => ({ id: entry.id, label: `${entry.label} · ${entry.detail}` }))))
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, kind, value]);
  return (
    <div className={c.editorCol}>
      {value.length ? (
        <ul className={c.ranked} aria-label={`${label} linked`}>
          {value.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              <button type="button" className={c.textButton} aria-label={`Unlink ${item.label}`} onClick={() => onChange(value.filter((other) => other.id !== item.id))}>
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value.length < 12 ? (
        <FormField label={`Link ${label.toLowerCase()}`} id={id} error={error} hint="Type a name to find it.">
          <TextField value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
        </FormField>
      ) : null}
      {options.length ? (
        <ul className={c.options} aria-label={`Matching ${label.toLowerCase()}`}>
          {options.slice(0, 6).map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={c.option}
                onClick={() => {
                  onChange([...value, option]);
                  setQuery("");
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Content editor (Pen 106 · X3mMi; states pJPKT): text, parts, SEO, links; save, preview and publish. */
export function ContentEditor({ page: initial, updatedByName }: { page: AdminContentPage; updatedByName: string | null }) {
  const router = useRouter();
  const [page, setPage] = useState(initial);
  const [fields, setFields] = useState<ContentFields>(initial.fields);
  const [products, setProducts] = useState<Linked[]>(initial.linkedProducts.map((item) => ({ id: item.id, label: item.name })));
  const [pages, setPages] = useState<Linked[]>(initial.linkedPages.map((item) => ({ id: item.id, label: `${item.title} · ${CONTENT_TYPE_LABEL[item.type]}` })));
  const [hero, setHero] = useState<FileView | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | "status" | "preview" | null>(null);
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | "archive" | null>(null);
  const [dirty, setDirty] = useState(false);
  const saving = useRef(false);
  // The latest form, so a save started from an editor callback sees the change that triggered it.
  const latest = useRef({ fields, products, pages, hero, page });
  latest.current = { fields, products, pages, hero, page };

  const singular = SINGULAR[page.type];
  const archived = page.status === "ARCHIVED";
  const liveHref = siteUrl(contentHref(page.type, page.fields.slug));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof ContentFields>(key: K, value: ContentFields[K]) => {
    const next = { ...latest.current.fields, [key]: value };
    latest.current.fields = next;
    setFields(next);
    setDirty(true);
  };

  const fail = (error: unknown, title: string) => {
    if (error instanceof ApiError) {
      if (error.body.fieldErrors) setErrors(error.body.fieldErrors);
      if (error.code === "VERSION_CONFLICT") return setBanner({ tone: "warning", title: "Someone else saved first", body: "Reload to see their changes, then make yours again." });
      return setBanner({ tone: "error", title, body: error.body.fieldErrors ? "Fix the fields marked below." : error.message });
    }
    setBanner({ tone: "error", title, body: "Check your connection and try again." });
  };

  const accept = (saved: AdminContentPage) => {
    setPage(saved);
    setFields(saved.fields);
    setDirty(false);
  };

  /** Saves the working copy. Returns the saved page, or null when it failed. */
  const save = async (quiet = false): Promise<AdminContentPage | null> => {
    if (saving.current) return null;
    saving.current = true;
    setErrors({});
    if (!quiet) setBanner(null);
    setBusy("save");
    const { fields, products, pages, hero, page } = latest.current;
    try {
      const saved = await api(`/v1/admin/content/${page.id}`, {
        method: "PUT",
        body: {
          ...fields,
          ...(hero ? { heroFileId: hero.id } : {}),
          linkedProductIds: products.map((item) => item.id),
          linkedPageIds: pages.map((item) => item.id),
          version: page.version,
        },
        response: adminContentPageSchema,
      });
      accept(saved);
      setHero(null);
      if (saved.sanitized) setBanner({ tone: "warning", title: "Unsafe content removed", body: removedText(saved.sanitized) });
      else if (!quiet) setBanner({ tone: "success", title: "Draft saved", body: saved.status === "PUBLISHED" ? "The live page is unchanged until you publish. Recorded in the audit log." : "Recorded in the audit log." });
      router.refresh();
      return saved;
    } catch (error) {
      fail(error, "Not saved");
      return null;
    } finally {
      saving.current = false;
      setBusy(null);
    }
  };

  /**
   * Opens the current draft on the customer site through a signed link that
   * lasts an hour (owner, 2026-10-05). Unsaved changes are saved first. The
   * tab opens straight away so the browser doesn't block it.
   */
  const preview = async () => {
    const tab = window.open("", "_blank");
    if (dirty && !(await save(true))) return tab?.close();
    setBusy("preview");
    try {
      const { url } = await api(`/v1/admin/content/${latest.current.page.id}/preview-link`, { method: "POST", response: z.object({ url: z.string(), expiresAt: z.string() }) });
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else window.location.assign(url);
    } catch (error) {
      tab?.close();
      fail(error, "Preview not available");
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setConfirm(null);
    const saved = dirty || hero ? await save(true) : page;
    if (!saved) return;
    setBusy("publish");
    try {
      const published = await api(`/v1/admin/content/${saved.id}/publish`, { method: "POST", body: { version: saved.version }, response: adminContentPageSchema });
      accept(published);
      const name = singular.charAt(0).toUpperCase() + singular.slice(1);
      setBanner({
        tone: "success",
        title: `${name} published`,
        body: published.fields.indexable ? `The ${singular} is live and in the sitemap. Recorded in the audit log.` : `The ${singular} is live but hidden from search engines. Recorded in the audit log.`,
      });
      router.refresh();
    } catch (error) {
      fail(error, "Not published");
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (to: "DRAFT" | "ARCHIVED") => {
    setConfirm(null);
    setBusy("status");
    try {
      const changed = await api(`/v1/admin/content/${page.id}/status`, { method: "POST", body: { to, version: page.version }, response: adminContentPageSchema });
      accept(changed);
      setBanner(
        to === "ARCHIVED"
          ? { tone: "warning", title: "Archived", body: `The ${singular} is off the site and out of search. History is kept.` }
          : { tone: "info", title: "Unpublished", body: `The ${singular} is off the site and back to draft. Your text is kept.` },
      );
      router.refresh();
    } catch (error) {
      fail(error, to === "ARCHIVED" ? "Not archived" : "Not unpublished");
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  const summary = Object.entries(errors).map(([key, message]) => ({ fieldId: fieldId(key), message }));
  const seoTitleLength = fields.seoTitle.length;
  const seoDescriptionLength = fields.seoDescription.length;
  const saved = page.updatedAt ? formatTime(page.updatedAt).split(" ").at(-1) : null;

  return (
    <form noValidate onSubmit={submit} className={c.editorCol} aria-labelledby="content-record-title">
      <header className={c.recordHeader}>
        <div className={c.recordText}>
          <p className={c.reference}>CONTENT PAGE · {CONTENT_TYPE_LABEL[page.type].toUpperCase()}</p>
          <h1 id="content-record-title" className={c.recordTitle}>
            {page.title}
          </h1>
          <p className={c.chips}>
            <StatusChip tone={TONE[page.status]}>{page.status}</StatusChip>
            {page.demo ? <StatusChip tone="warning">DEMO</StatusChip> : null}
            {page.unpublishedChanges && page.status === "PUBLISHED" ? <StatusChip tone="info">UNPUBLISHED CHANGES</StatusChip> : null}
            <span className={c.meta}>
              {updatedByName ? `Author ${updatedByName} · ` : ""}saved {saved}
              {dirty ? " · unsaved changes" : ""}
            </span>
          </p>
        </div>
        <div className={c.actions}>
          {!archived ? (
            <Button type="submit" variant="tertiary" loading={busy === "save"} disabled={busy !== null && busy !== "save"}>
              Save draft
            </Button>
          ) : null}
          {!archived ? (
            <Button type="button" variant="secondary" loading={busy === "preview"} disabled={busy !== null && busy !== "preview"} onClick={() => void preview()}>
              Preview draft
            </Button>
          ) : null}
          {page.publishedAt && !archived ? (
            <ButtonLink variant="tertiary" href={liveHref} target="_blank" rel="noopener">
              View live
            </ButtonLink>
          ) : null}
          {!archived ? (
            <Button type="button" loading={busy === "publish"} disabled={busy !== null && busy !== "publish"} onClick={() => setConfirm("publish")}>
              Publish
            </Button>
          ) : (
            <Button type="button" variant="secondary" loading={busy === "status"} onClick={() => void changeStatus("DRAFT")}>
              Restore to draft
            </Button>
          )}
        </div>
      </header>

      {banner ? (
        <Notice tone={banner.tone} title={banner.title} live>
          <p>{banner.body}</p>
        </Notice>
      ) : page.sanitized ? (
        <Notice tone="warning" title="Unsafe content removed">
          <p>{removedText(page.sanitized)}</p>
        </Notice>
      ) : null}
      {summary.length ? <ErrorSummary errors={summary} /> : null}

      <div className={c.columns}>
        <fieldset className={`${c.editorCol} ${c.parts}`} disabled={archived}>
          <FormField label="Page type" id="content-type" hint="Set when the page was created.">
            <Select value={page.type} disabled options={[{ value: page.type, label: CONTENT_TYPE_LABEL[page.type] }]} />
          </FormField>
          <FormField label="Title" id={FIELD_IDS.title} error={errors.title}>
            <TextField value={fields.title} maxLength={140} onChange={(event) => set("title", event.target.value)} />
          </FormField>
          <FormField label="Address" id={FIELD_IDS.slug} error={errors.slug} hint={page.type === "ABOUT" ? "The About page always lives at /about." : `${CONTENT_PATH[page.type]}/${fields.slug || "…"}${page.publishedAt ? " · changing it moves the live page when you publish" : ""}`}>
            <TextField value={fields.slug} maxLength={80} readOnly={page.type === "ABOUT"} onChange={(event) => set("slug", event.target.value)} />
          </FormField>
          <FormField label="Summary" id={FIELD_IDS.summary} error={errors.summary} hint="One or two sentences for cards, search results and the page description.">
            <TextArea value={fields.summary} maxLength={300} rows={3} onChange={(event) => set("summary", event.target.value)} />
          </FormField>
          <div className={c.editorCol} id={FIELD_IDS.body} tabIndex={-1}>
            <p className={c.fieldLabel} id="content-body-label">
              Page text
            </p>
            {errors.body ? <p className={c.hint}>{errors.body}</p> : null}
            <RichTextEditor
              value={fields.body}
              blocks={page.type === "GUIDE"}
              labelledBy="content-body-label"
              onChange={(html) => set("body", html)}
            />
          </div>
          <section className={c.panel} aria-labelledby="content-parts-title">
            <h2 id="content-parts-title" className={c.panelTitle}>
              {CONTENT_TYPE_LABEL[page.type]} parts
            </h2>
            <PartsEditor fields={PARTS[page.type]} value={fields.data} errors={errors} disabled={archived} onChange={(data) => set("data", data)} />
          </section>
        </fieldset>

        <fieldset className={`${c.side} ${c.parts}`} disabled={archived}>
          <section className={c.panel} aria-labelledby="content-seo-title-heading">
            <h2 id="content-seo-title-heading" className={c.panelTitle}>
              SEO
            </h2>
            <FormField
              label="SEO title"
              id={FIELD_IDS.seoTitle}
              error={errors.seoTitle}
              hint={
                <span className={c.count} data-over={seoTitleLength > 60}>
                  {seoTitleLength} of 60 · empty uses the title
                </span>
              }
            >
              <TextField value={fields.seoTitle} maxLength={70} onChange={(event) => set("seoTitle", event.target.value)} />
            </FormField>
            <FormField
              label="Meta description"
              id={FIELD_IDS.seoDescription}
              error={errors.seoDescription}
              hint={
                <span className={c.count} data-over={seoDescriptionLength > 160}>
                  {seoDescriptionLength} of 160 · empty uses the summary
                </span>
              }
            >
              <TextArea value={fields.seoDescription} maxLength={170} rows={3} onChange={(event) => set("seoDescription", event.target.value)} />
            </FormField>
            <FormField label="Canonical URL" id={FIELD_IDS.canonicalPath} error={errors.canonicalPath} hint="Empty means this page (the default).">
              <TextField value={fields.canonicalPath} placeholder="Self (default)" onChange={(event) => set("canonicalPath", event.target.value)} />
            </FormField>
            <label className={c.toggle}>
              <input type="checkbox" role="switch" checked={fields.indexable} onChange={(event) => set("indexable", event.target.checked)} />
              <span className={c.track} aria-hidden="true">
                <span className={c.knob} />
              </span>
              <span className={c.toggleLabel}>Allow search indexing</span>
              <span className={c.state} aria-hidden="true">
                {fields.indexable ? "On" : "Off"}
              </span>
            </label>
          </section>

          <section className={c.panel} aria-labelledby="content-links-title">
            <h2 id="content-links-title" className={c.panelTitle}>
              Linked items
            </h2>
            <dl className={c.kv}>
              <dt>Products</dt>
              <dd>{products.length ? products.map((item) => item.label).join(", ") : "None"}</dd>
              <dt>Pages</dt>
              <dd>{pages.length ? pages.map((item) => item.label.split(" · ")[0]).join(", ") : "None"}</dd>
            </dl>
            <LinkPicker
              id={FIELD_IDS.linkedProductIds!}
              label="Products"
              kind="PRODUCT"
              value={products}
              error={errors.linkedProductIds}
              onChange={(next) => {
                setProducts(next);
                setDirty(true);
              }}
            />
            <LinkPicker
              id={FIELD_IDS.linkedPageIds!}
              label="Pages"
              kind="PAGE"
              value={pages}
              error={errors.linkedPageIds}
              onChange={(next) => {
                setPages(next);
                setDirty(true);
              }}
            />
          </section>

          <section className={c.panel} aria-labelledby="content-hero-title" id={FIELD_IDS.heroFileId}>
            <h2 id="content-hero-title" className={c.panelTitle}>
              Hero image
            </h2>
            {page.heroImage && !hero ? (
              <img className={c.hero} src={staffMediaUrl(page.heroImage.url)} alt="" />
            ) : null}
            {errors.heroFileId ? <p className={c.hint}>{errors.heroFileId}</p> : null}
            {!archived ? (
              <FileUpload
                purpose="CONTENT_MEDIA"
                label={page.heroImage ? "Replace the image" : "Drop an image or browse files"}
                hint="JPEG, PNG or WebP, at least 1600 px wide"
                accept="image/jpeg,image/png,image/webp"
                onChange={(file) => {
                  setHero(file && file.status === "READY" ? file : null);
                  setDirty(true);
                }}
              />
            ) : null}
            {page.heroImage || hero ? (
              <>
                <FormField label="Describe the image" id={FIELD_IDS.heroAlt} error={errors.heroAlt} hint="For people who can't see it.">
                  <TextField value={fields.heroAlt} maxLength={200} onChange={(event) => set("heroAlt", event.target.value)} />
                </FormField>
                <button
                  type="button"
                  className={`${c.textButton} ${c.add}`}
                  onClick={() => {
                    setHero(null);
                    set("heroFileId", null);
                    setPage((state) => ({ ...state, heroImage: null }));
                  }}
                >
                  <X size={16} aria-hidden="true" />
                  Remove the image
                </button>
              </>
            ) : null}
          </section>

          <section className={c.panel} aria-labelledby="content-listing-title">
            <h2 id="content-listing-title" className={c.panelTitle}>
              Listing
            </h2>
            <label className={c.toggle}>
              <input type="checkbox" role="switch" checked={fields.featured} onChange={(event) => set("featured", event.target.checked)} />
              <span className={c.track} aria-hidden="true">
                <span className={c.knob} />
              </span>
              <span className={c.toggleLabel}>Feature on the index</span>
              <span className={c.state} aria-hidden="true">
                {fields.featured ? "On" : "Off"}
              </span>
            </label>
            <label className={c.toggle}>
              <input type="checkbox" role="switch" checked={fields.demo} onChange={(event) => set("demo", event.target.checked)} />
              <span className={c.track} aria-hidden="true">
                <span className={c.knob} />
              </span>
              <span className={c.toggleLabel}>Label as demo content</span>
              <span className={c.state} aria-hidden="true">
                {fields.demo ? "On" : "Off"}
              </span>
            </label>
            <FormField label="Position" id={FIELD_IDS.position} error={errors.position} hint="Lower numbers come first.">
              <TextField type="number" inputMode="numeric" min={0} max={10000} value={String(fields.position)} onChange={(event) => set("position", Math.max(0, Math.min(10_000, Number(event.target.value) || 0)))} />
            </FormField>
          </section>

          {page.status !== "ARCHIVED" ? (
            <section className={c.panel} aria-labelledby="content-status-title">
              <h2 id="content-status-title" className={c.panelTitle}>
                Status
              </h2>
              <p className={c.hint}>{page.publishedAt ? `Published ${formatTime(page.publishedAt)}.` : "Never published."}</p>
              <div className={c.actions}>
                {page.status === "PUBLISHED" ? (
                  <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setConfirm("unpublish")}>
                    Unpublish
                  </Button>
                ) : null}
                {page.type !== "ABOUT" ? (
                  <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setConfirm("archive")}>
                    Archive
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </fieldset>
      </div>

      <Dialog
        open={confirm === "publish"}
        onClose={() => setConfirm(null)}
        title={`Publish this ${singular}?`}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void publish()}>
              Publish now
            </Button>
          </>
        }
      >
        <p className={c.hint}>
          {dirty ? "Your changes are saved first. " : ""}
          {page.publishedAt ? `The live page at ${contentHref(page.type, fields.slug)} is replaced with this version.` : `It goes live at ${contentHref(page.type, fields.slug)}.`}{" "}
          {fields.indexable ? "Search engines are told about it." : "Search engines are asked not to index it."}
        </p>
      </Dialog>
      <Dialog
        open={confirm === "unpublish" || confirm === "archive"}
        onClose={() => setConfirm(null)}
        title={confirm === "archive" ? `Archive this ${singular}?` : `Unpublish this ${singular}?`}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button type="button" variant="ink" onClick={() => void changeStatus(confirm === "archive" ? "ARCHIVED" : "DRAFT")}>
              {confirm === "archive" ? `Archive ${singular}` : `Unpublish ${singular}`}
            </Button>
          </>
        }
      >
        <p className={c.hint}>
          {confirm === "archive"
            ? `It comes off the site and out of search, and can't be published again until restored to draft. History is kept.`
            : `It comes off the site and out of search. The text stays here as a draft.`}
        </p>
      </Dialog>
    </form>
  );
}
