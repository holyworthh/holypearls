"use client";

import {
  type Project,
  type ProjectItem,
  type ProjectRecommendation,
  type PublicProductCard,
  RECOMMENDATION_GROUP_LABEL,
  type RecommendationGroup,
  searchResultsSchema,
} from "@holypearls/contracts";
import { Button, FormField, TextArea, TextField } from "@holypearls/ui";
import { FileUpload } from "../FileUpload";
import { Check, Minus, Plus, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { api } from "../../lib/api";
import { naira } from "../../lib/money";
import s from "./builder.module.css";

/*
 * Recommendations (Pen 24 · LqHMw; PROJ-FR-003–006, Stage 3.1D §10–13).
 * Recommended items start in the project; useful additions and optional
 * extras are offered. Every suggestion says why. Included or removed is
 * shown in words, not colour only (Stage 3.1D §29).
 */

type Price = NonNullable<PublicProductCard["price"]>;
export function fromPrice(price: Price | null | undefined): string | null {
  if (!price) return null;
  const unit = price.basis === "PER_UNIT" ? " / piece" : price.basis === "PER_PACK" ? ` / pack of ${price.packSize}` : "";
  return `From ${naira(price.amountMinor)}${unit}`;
}

export interface RecommendationActions {
  setState: (key: string, state: "INCLUDED" | "REMOVED") => void;
  setQuantity: (key: string, quantity: number | null) => void;
  addItem: (input: { productSlug?: string; name?: string; description?: string; quantity?: number | null; quantityNote?: string }) => Promise<boolean>;
  updateItem: (id: string, input: { quantity?: number | null; quantityNote?: string | null }) => void;
  removeItem: (id: string) => void;
  attachFile: (fileId: string, itemId: string) => void;
}

function Stepper({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value === null ? "" : String(value));
  }
  const commit = () => {
    const parsed = Number(text);
    if (text === "") onChange(null);
    else if (Number.isInteger(parsed) && parsed >= 1 && parsed !== value) onChange(parsed);
    else setText(value === null ? "" : String(value));
  };
  return (
    <span className={s.stepper} role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" aria-label={`One fewer ${label}`} disabled={!value || value <= 1} onClick={() => onChange(Math.max(1, (value ?? 1) - 1))}>
        <Minus size={16} aria-hidden="true" />
      </button>
      <input
        aria-label={`Quantity of ${label}`}
        inputMode="numeric"
        value={text}
        placeholder="—"
        onChange={(event) => setText(event.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      <button type="button" aria-label={`One more ${label}`} onClick={() => onChange((value ?? 0) + 1)}>
        <Plus size={16} aria-hidden="true" />
      </button>
    </span>
  );
}

const quantityOf = (rec: ProjectRecommendation) => rec.customerQuantity ?? rec.suggestedQuantity;

function Toggle({ rec, actions }: { rec: ProjectRecommendation; actions: RecommendationActions }) {
  if (rec.state === "INCLUDED") {
    return (
      <span className={s.inline}>
        <span className={s.inProject} role="status">
          <Check size={16} aria-hidden="true" />
          In project
        </span>
        <button type="button" className={s.removeButton} onClick={() => actions.setState(rec.key, "REMOVED")}>
          Remove<span className="hp-visually-hidden"> {rec.name}</span>
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={s.addButton} onClick={() => actions.setState(rec.key, "INCLUDED")}>
      <Plus size={16} aria-hidden="true" />
      {rec.state === "REMOVED" ? "Undo" : "Add"}
      <span className="hp-visually-hidden"> {rec.name}</span>
    </button>
  );
}

function meta(rec: ProjectRecommendation) {
  const quantity = quantityOf(rec);
  const parts = [
    rec.state === "REMOVED" ? "Removed" : null,
    !rec.stillSuggested ? "No longer suggested for your brief" : null,
    rec.product ? fromPrice(rec.product.price) : "Quoted after review",
    quantity === null ? "Quantity after review" : null,
    rec.customerQuantity !== null && rec.suggestedQuantity !== null && rec.customerQuantity !== rec.suggestedQuantity ? `We suggested ${rec.suggestedQuantity}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function Card({ rec, actions, photoFirst }: { rec: ProjectRecommendation; actions: RecommendationActions; photoFirst: boolean }) {
  return (
    <li>
      <article className={s.card} data-state={rec.state} data-group={rec.group} aria-label={rec.name}>
        {photoFirst ? <div className={s.cardPhoto}>{rec.product?.image ? <img src={rec.product.image.url} alt="" loading="lazy" decoding="async" /> : null}</div> : null}
        <div className={s.cardBody}>
          <div>
            <p className={s.why}>Why · {rec.reason}</p>
            <h3 className={s.cardTitle}>{rec.name}</h3>
            <p className={s.cardMeta}>{meta(rec)}</p>
          </div>
          <div className={s.cardActions}>
            <Stepper label={rec.name} value={quantityOf(rec)} onChange={(quantity) => actions.setQuantity(rec.key, quantity)} />
            <Toggle rec={rec} actions={actions} />
          </div>
        </div>
      </article>
    </li>
  );
}

function OptionalRow({ rec, actions }: { rec: ProjectRecommendation; actions: RecommendationActions }) {
  return (
    <li className={s.optionalRow} data-state={rec.state}>
      <p className={s.optionalTitle}>{rec.name}</p>
      <p className={s.cardMeta}>
        {rec.reason} · {meta(rec)}
      </p>
      <Toggle rec={rec} actions={actions} />
    </li>
  );
}

const GROUP_META: Record<RecommendationGroup, string> = {
  RECOMMENDED: "based on your brief",
  USEFUL: "Often ordered for projects like this",
  OPTIONAL: "Nice to have — skip freely",
};

function YourItem({ item, actions }: { item: ProjectItem; actions: RecommendationActions }) {
  return (
    <li className={s.optionalRow}>
      <div>
        <p className={s.optionalTitle}>{item.name}</p>
        {item.kind === "CUSTOM" ? <span className={s.tag}>CUSTOM ITEM · QUOTED SEPARATELY</span> : null}
      </div>
      <div>
        <p className={s.cardMeta}>{[item.description, item.quantityNote, item.product ? fromPrice(item.product.price) : null].filter(Boolean).join(" · ") || "Configure later"}</p>
        {item.files.length ? <p className={s.cardMeta}>Files: {item.files.map((file) => file.name).join(", ")}</p> : null}
        {item.kind === "CUSTOM" ? (
          <FileUpload purpose="PROJECT_ATTACHMENT" label="Add a reference file" hint="PDF, AI, SVG, PNG or JPEG" onChange={(file) => (file ? actions.attachFile(file.id, item.id) : undefined)} />
        ) : null}
      </div>
      <span className={s.inline}>
        <Stepper label={item.name} value={item.quantity} onChange={(quantity) => actions.updateItem(item.id, { quantity })} />
        <button type="button" className={s.removeButton} onClick={() => actions.removeItem(item.id)}>
          Remove<span className="hp-visually-hidden"> {item.name}</span>
        </button>
      </span>
    </li>
  );
}

/** "Add something else": a catalogue product, or a custom item described in the customer's words (PROJ-FR-005). */
function AddItem({ actions }: { actions: RecommendationActions }) {
  const [mode, setMode] = useState<"catalogue" | "custom" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProductCard[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quantityNote, setQuantityNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearchFailed(false);
    try {
      const found = await api(`/v1/search?scope=products&q=${encodeURIComponent(query.trim())}`, { response: searchResultsSchema });
      setResults(found.products.entries);
    } catch {
      setSearchFailed(true);
    }
  };

  const addCustom = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Describe the item.");
      return;
    }
    setError(null);
    if (await actions.addItem({ name: name.trim(), description: description.trim() || undefined, quantityNote: quantityNote.trim() || undefined })) {
      setName("");
      setDescription("");
      setQuantityNote("");
      setMode(null);
    }
  };

  return (
    <section className={s.addPanel} aria-labelledby="add-title">
      <h3 id="add-title" className={s.optionalTitle}>
        Add something else
      </h3>
      <div className={s.addTabs}>
        <button type="button" className={s.addButton} aria-expanded={mode === "catalogue"} onClick={() => setMode(mode === "catalogue" ? null : "catalogue")}>
          <Search size={16} aria-hidden="true" />
          From our products
        </button>
        <button type="button" className={s.addButton} aria-expanded={mode === "custom"} onClick={() => setMode(mode === "custom" ? null : "custom")}>
          <Plus size={16} aria-hidden="true" />
          Something custom
        </button>
      </div>
      {mode === "catalogue" ? (
        <>
          <form className={s.inline} onSubmit={search} role="search">
            <FormField id="add-search" label="Search our products">
              <TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. tote bag" />
            </FormField>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          {searchFailed ? <p className={s.fieldError}>We couldn&apos;t search just now. Try again.</p> : null}
          {results ? (
            results.length ? (
              <ul className={s.results} aria-live="polite">
                {results.slice(0, 6).map((product) => (
                  <li key={product.slug} className={s.result}>
                    <span>
                      <span className={s.railTitle}>{product.name}</span>
                      <span className={s.railQty}>{fromPrice(product.price) ?? "Quoted"}</span>
                    </span>
                    <button type="button" className={s.addButton} onClick={() => actions.addItem({ productSlug: product.slug })}>
                      <Plus size={16} aria-hidden="true" />
                      Add<span className="hp-visually-hidden"> {product.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.hint} aria-live="polite">
                Nothing matched. Add it as something custom instead.
              </p>
            )
          ) : null}
        </>
      ) : null}
      {mode === "custom" ? (
        <form className={s.questions} onSubmit={addCustom} noValidate>
          <FormField id="custom-name" label="What is it?" error={error ?? undefined}>
            <TextField value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sponsor welcome kit" />
          </FormField>
          <FormField id="custom-description" label="Describe it" hint="Materials, size, anything you know. You can add a reference file next." optional>
            <TextArea value={description} maxLength={2000} rows={3} onChange={(event) => setDescription(event.target.value)} />
          </FormField>
          <FormField id="custom-quantity" label="About how many?" hint="A rough number is fine, e.g. about 30." optional>
            <TextField value={quantityNote} maxLength={120} onChange={(event) => setQuantityNote(event.target.value)} />
          </FormField>
          <Button type="submit">Add to project</Button>
        </form>
      ) : null}
    </section>
  );
}

export function Recommendations({ project, actions }: { project: Project; actions: RecommendationActions }) {
  const groups = (["RECOMMENDED", "USEFUL", "OPTIONAL"] as const).map((group) => ({ group, recs: project.recommendations.filter((rec) => rec.group === group) }));
  const any = project.recommendations.length > 0;
  return (
    <>
      {!any ? (
        <p className={s.lead}>We don&apos;t have suggestions for this kind of project yet. Add what you need below and we&apos;ll check it when we quote.</p>
      ) : null}
      {groups.map(({ group, recs }) =>
        recs.length ? (
          <section key={group} className={s.group} aria-labelledby={`group-${group}`}>
            <div className={s.groupHead}>
              <h2 id={`group-${group}`} className={s.groupTitle}>
                {RECOMMENDATION_GROUP_LABEL[group]}
              </h2>
              <span className={s.groupMeta}>{group === "RECOMMENDED" ? `${recs.length} ${recs.length === 1 ? "item" : "items"}, ${GROUP_META[group]}` : GROUP_META[group]}</span>
            </div>
            {group === "OPTIONAL" ? (
              <ul className={s.rowList}>
                {recs.map((rec) => (
                  <OptionalRow key={rec.key} rec={rec} actions={actions} />
                ))}
              </ul>
            ) : (
              <ul className={s.cards}>
                {recs.map((rec) => (
                  <Card key={rec.key} rec={rec} actions={actions} photoFirst={group === "RECOMMENDED"} />
                ))}
              </ul>
            )}
          </section>
        ) : null,
      )}
      <section className={s.group} aria-labelledby="your-items">
        <div className={s.groupHead}>
          <h2 id="your-items" className={s.groupTitle}>
            Your own items
          </h2>
          <span className={s.groupMeta}>Kept whatever you change above</span>
        </div>
        {project.items.length ? (
          <ul className={s.rowList}>
            {project.items.map((item) => (
              <YourItem key={item.id} item={item} actions={actions} />
            ))}
          </ul>
        ) : null}
        <AddItem actions={actions} />
      </section>
    </>
  );
}
