"use client";

import { siteUrl } from "@/lib/site";
import { type AdminHub, adminHubSchema, ApiError, type HubLayout, type HubSection } from "@holypearls/contracts";
import { Button, FormField, Notice, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { useState } from "react";
import { api } from "@holypearls/web-kit/api";
import styles from "../../../admin-list.module.css";
import css from "../../../products/catalogue.module.css";

const NAMES: Record<HubSection["type"], string> = {
  summary: "Summary",
  subcategories: "Subcategories",
  featured: "Featured products",
  grid: "Product grid",
  guidance: "Buying guidance",
  process: "How it's made (process)",
  faq: "FAQ",
  related: "Related projects and guides",
};

type Rows<T> = { items: T[]; set: (items: T[]) => void; blank: T; label: string; render: (item: T, index: number, update: (item: T) => void) => React.ReactNode };

function RowList<T>({ items, set, blank, label, render }: Rows<T>) {
  return (
    <>
      {items.map((item, index) => (
        <div key={index} className={css.pairRow}>
          {render(item, index, (next) => set(items.map((current, position) => (position === index ? next : current))))}
          <div className={css.rowActions}>
            <Button variant="tertiary" onClick={() => set(items.filter((_, position) => position !== index))}>
              Remove {label.toLowerCase()} {index + 1}
            </Button>
          </div>
        </div>
      ))}
      <div className={css.rowActions}>
        <Button variant="secondary" onClick={() => set([...items, blank])}>
          Add {label.toLowerCase()}
        </Button>
      </div>
    </>
  );
}

/** Fields for one section type. */
function SectionFields({ section, onChange }: { section: HubSection; onChange: (section: HubSection) => void }) {
  const field = (key: string, label: string, long = false, hint?: string) => {
    const value = (section as Record<string, unknown>)[key] as string;
    const id = `hub-${section.type}-${key}`;
    return (
      <FormField label={label} id={id} hint={hint}>
        {long ? (
          <TextArea value={value} onChange={(event) => onChange({ ...section, [key]: event.target.value } as HubSection)} />
        ) : (
          <TextField value={value} onChange={(event) => onChange({ ...section, [key]: event.target.value } as HubSection)} />
        )}
      </FormField>
    );
  };
  return (
    <>
      {field("heading", "Heading")}
      {section.type === "summary" ? (
        <>
          {field("body", "Introduction", true, "Shown under the heading. Plain, useful words; no SEO filler.")}
          {field("primaryLabel", "Main button text", false, "Opens the directory filtered to this category.")}
          {field("secondaryLabel", "Second button text")}
          {field("secondaryHref", "Second button link", false, "A path on this site, for example /contact?topic=project")}
        </>
      ) : null}
      {section.type === "subcategories" || section.type === "grid" ? (
        <p className={styles.hint}>{section.type === "grid" ? "Lists every published product in this category." : "Lists the published subcategories with their product counts."}</p>
      ) : null}
      {section.type === "featured" ? (
        <FormField label="Products (page addresses, one per line)" id="hub-featured-products" hint="Up to 8, in order. Unpublished products are skipped.">
          <TextArea
            value={section.productSlugs.join("\n")}
            onChange={(event) =>
              onChange({
                ...section,
                productSlugs: event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .slice(0, 8),
              })
            }
          />
        </FormField>
      ) : null}
      {section.type === "guidance" ? (
        <>
          {field("intro", "Introduction", true)}
          <FormField label="Column headings (comma-separated)" id="hub-guidance-columns" hint="The first column names each row, for example Method, Best for, Feel, Minimum.">
            <TextField
              value={section.columns.join(", ")}
              onChange={(event) => onChange({ ...section, columns: event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6) })}
            />
          </FormField>
          <RowList
            items={section.rows}
            set={(rows) => onChange({ ...section, rows })}
            blank={section.columns.map(() => "")}
            label="Row"
            render={(row, index, update) => (
              <FormField label={`Row ${index + 1} (separate cells with |)`} id={`hub-guidance-row-${index}`}>
                <TextField value={row.join(" | ")} onChange={(event) => update(event.target.value.split("|").map((cell) => cell.trim()).slice(0, 6))} />
              </FormField>
            )}
          />
          {field("note", "Note under the table", false, "For example, which values are still to be confirmed.")}
        </>
      ) : null}
      {section.type === "process" ? (
        <RowList
          items={section.steps}
          set={(steps) => onChange({ ...section, steps })}
          blank={{ title: "", body: "", detail: "" }}
          label="Step"
          render={(step, index, update) => (
            <>
              <FormField label={`Step ${index + 1} title`} id={`hub-step-title-${index}`}>
                <TextField value={step.title} onChange={(event) => update({ ...step, title: event.target.value })} />
              </FormField>
              <FormField label={`Step ${index + 1} text`} id={`hub-step-body-${index}`}>
                <TextArea value={step.body} onChange={(event) => update({ ...step, body: event.target.value })} />
              </FormField>
              <FormField label={`Step ${index + 1} detail`} id={`hub-step-detail-${index}`} hint="Short, for example “From 10 pieces · 3–7 working days”.">
                <TextField value={step.detail} onChange={(event) => update({ ...step, detail: event.target.value })} />
              </FormField>
            </>
          )}
        />
      ) : null}
      {section.type === "faq" ? (
        <RowList
          items={section.items}
          set={(items) => onChange({ ...section, items })}
          blank={{ question: "", answer: "" }}
          label="Question"
          render={(item, index, update) => (
            <>
              <FormField label={`Question ${index + 1}`} id={`hub-faq-q-${index}`}>
                <TextField value={item.question} onChange={(event) => update({ ...item, question: event.target.value })} />
              </FormField>
              <FormField label={`Answer ${index + 1}`} id={`hub-faq-a-${index}`}>
                <TextArea value={item.answer} onChange={(event) => update({ ...item, answer: event.target.value })} />
              </FormField>
            </>
          )}
        />
      ) : null}
      {section.type === "related" ? (
        <RowList
          items={section.links}
          set={(links) => onChange({ ...section, links })}
          blank={{ title: "", body: "", href: "" }}
          label="Link"
          render={(link, index, update) => (
            <>
              <FormField label={`Link ${index + 1} title`} id={`hub-link-title-${index}`}>
                <TextField value={link.title} onChange={(event) => update({ ...link, title: event.target.value })} />
              </FormField>
              <FormField label={`Link ${index + 1} description`} id={`hub-link-body-${index}`}>
                <TextField value={link.body} onChange={(event) => update({ ...link, body: event.target.value })} />
              </FormField>
              <FormField label={`Link ${index + 1} address`} id={`hub-link-href-${index}`} hint="A path on this site, for example /categories/embroidery">
                <TextField value={link.href} onChange={(event) => update({ ...link, href: event.target.value })} />
              </FormField>
            </>
          )}
        />
      ) : null}
    </>
  );
}

/** Category hub section editor (Pen 105 · k4obTd, states kTtKZ; PUB-FR-009). */
export function HubEditor({ initial }: { initial: AdminHub }) {
  const [hub, setHub] = useState(initial);
  const [sections, setSections] = useState(initial.draft.sections);
  const [layout, setLayout] = useState<HubLayout>(initial.draft.layout);
  const [selected, setSelected] = useState<HubSection["type"]>("summary");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "warning"; title: string; body: string } | null>(null);

  const dirty = JSON.stringify(sections) !== JSON.stringify(hub.draft.sections) || layout !== hub.draft.layout;
  const unpublished = dirty || hub.unpublishedChanges;
  const current = sections.find((section) => section.type === selected)!;

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
      setNotice({ tone: "warning", title: "Someone else saved first", body: "Reload to see their changes, then make yours again." });
    } else if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
      setNotice({ tone: "error", title: "Check the sections", body: "Some text is too long or a list has too many items." });
    } else setNotice({ tone: "error", title: "Something went wrong", body: error instanceof ApiError ? `Request ID ${error.body.requestId}` : "Try again." });
  };

  const save = async () => {
    const saved = await api(`/v1/admin/catalogue/categories/${hub.categoryId}/hub`, {
      method: "PUT",
      body: { hub: { layout, sections }, version: hub.version },
      response: adminHubSchema,
    });
    setHub(saved);
    setSections(saved.draft.sections);
    setLayout(saved.draft.layout);
    return saved;
  };

  const run = async (publish: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      let latest = dirty ? await save() : hub;
      if (publish) {
        latest = await api(`/v1/admin/catalogue/categories/${hub.categoryId}/hub/publish`, {
          method: "POST",
          body: { version: latest.version },
          response: adminHubSchema,
        });
        setHub(latest);
        setSections(latest.draft.sections);
        setLayout(latest.draft.layout);
      }
      setNotice(
        publish
          ? { tone: "success", title: "Hub published", body: `${hub.categoryName} page refreshed (cache tags). Recorded in the audit log.` }
          : { tone: "success", title: "Draft saved", body: "The public page doesn't change until you publish." },
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, step: number) => {
    const next = [...sections];
    const [moved] = next.splice(index, 1);
    next.splice(index + step, 0, moved!);
    setSections(next);
  };
  const update = (section: HubSection) => setSections(sections.map((item) => (item.type === section.type ? section : item)));

  return (
    <>
      <header className={css.headRow}>
        <div className={styles.recordHead}>
          <p className={styles.eyebrow}>
            <a href="/categories">CATALOGUE › CATEGORIES</a> › HUB
          </p>
          <h1 className={styles.recordTitle}>{hub.categoryName} hub</h1>
          <p className={styles.chips}>
            {unpublished ? <StatusChip tone="warning">Unpublished changes</StatusChip> : <StatusChip tone="success">Live</StatusChip>}
            <span>
              {hub.publishedAt ? `Published version is live · published ${new Date(hub.publishedAt).toLocaleString("en-NG")}` : "Not published yet · the page shows the default sections"}
            </span>
          </p>
        </div>
        <div className={css.headActions}>
          <a className={styles.action} href={siteUrl(`/categories/${hub.slug}`)} target="_blank" rel="noreferrer">
            View live page ↗
          </a>
          <Button variant="secondary" loading={busy} disabled={!dirty} onClick={() => void run(false)}>
            Save draft
          </Button>
          <Button loading={busy} disabled={!unpublished} onClick={() => void run(true)}>
            Publish changes
          </Button>
        </div>
      </header>
      {notice ? (
        <Notice tone={notice.tone} title={notice.title} live>
          <p>{notice.body}</p>
        </Notice>
      ) : null}
      <div className={styles.columns}>
        <section className={`${styles.panel} ${styles.detailCol}`} aria-labelledby="sections-title">
          <fieldset className={css.fieldset}>
            <legend className={styles.panelTitle}>Page layout</legend>
            {(
              [
                ["EDITORIAL", "Editorial", "Photo-led, for garment hubs"],
                ["CATALOGUE", "Catalogue", "Product-led, with subcategory cards"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className={css.radio}>
                <input type="radio" name="hub-layout" value={value} checked={layout === value} onChange={() => setLayout(value)} />
                {label} · {hint}
              </label>
            ))}
          </fieldset>
          <h2 id="sections-title" className={styles.panelTitle}>
            Sections
          </h2>
          <ol className={css.mediaList}>
            {sections.map((section, index) => (
              <li key={section.type} className={css.pairRow} aria-current={section.type === selected ? "true" : undefined}>
                <div className={styles.itemTop}>
                  <button type="button" className={styles.action} onClick={() => setSelected(section.type)} aria-pressed={section.type === selected}>
                    {NAMES[section.type]}
                  </button>
                  <label className={css.radio}>
                    <input type="checkbox" checked={section.visible} onChange={() => update({ ...section, visible: !section.visible })} />
                    {section.visible ? "Shown" : "Hidden"}
                  </label>
                </div>
                <div className={css.rowActions}>
                  <Button variant="tertiary" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move up: ${NAMES[section.type]}`}>
                    Move up
                  </Button>
                  <Button variant="tertiary" disabled={index === sections.length - 1} onClick={() => move(index, 1)} aria-label={`Move down: ${NAMES[section.type]}`}>
                    Move down
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <p className={styles.hint}>Keyboard: focus a section and use Move up / Move down.</p>
        </section>
        <section className={`${styles.panel} ${styles.tableCol}`} aria-labelledby="section-editor-title">
          <h2 id="section-editor-title" className={styles.panelTitle}>
            {NAMES[current.type]}
            {current.type === "faq" ? ` · ${current.items.length} ${current.items.length === 1 ? "question" : "questions"}` : ""}
          </h2>
          <SectionFields section={current} onChange={update} />
        </section>
      </div>
    </>
  );
}
