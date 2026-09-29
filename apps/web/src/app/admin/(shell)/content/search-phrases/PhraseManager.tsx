"use client";

import { ApiError, type SearchPhrase, searchPhraseSchema, searchTargetOptionsSchema } from "@holypearls/contracts";
import { Button, ErrorSummary, FormField, Notice, TextField } from "@holypearls/ui";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../../../../../lib/api";
import styles from "../../admin-list.module.css";
import c from "../content-admin.module.css";

type Target = { type: "PRODUCT" | "CATEGORY" | "PAGE"; id: string; label: string; detail: string };
const KIND = { PRODUCT: "Product", CATEGORY: "Category", PAGE: "Page" } as const;

/** Everyday phrases that lead to the right page (PUB-FR-007): add, list and remove. */
export function PhraseManager({ initial }: { initial: SearchPhrase[] }) {
  const router = useRouter();
  const [phrases, setPhrases] = useState(initial);
  const [phrase, setPhrase] = useState("");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Target[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q || (target && q === target.label)) return setOptions([]);
    const timer = setTimeout(() => {
      api(`/v1/admin/search/targets?q=${encodeURIComponent(q)}`, { response: searchTargetOptionsSchema })
        .then((result) => setOptions(result.entries))
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, target]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (phrase.trim().length < 2) next.phrase = "Use at least 2 characters";
    if (!target) next.targetId = "Choose where it leads";
    setErrors(next);
    setNotice(null);
    if (Object.keys(next).length || !target) return;
    setBusy(true);
    try {
      const created = await api("/v1/admin/search/phrases", { method: "POST", body: { phrase: phrase.trim(), targetType: target.type, targetId: target.id }, response: searchPhraseSchema });
      setPhrases((list) => [created, ...list]);
      setNotice({ tone: "success", title: "Phrase added", body: `Searching “${created.phrase}” now leads to ${created.target.label}. Recorded in the audit log.` });
      setPhrase("");
      setQuery("");
      setTarget(null);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setNotice({ tone: "error", title: "Not added", body: error instanceof ApiError ? error.message : "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: SearchPhrase) => {
    setRemoving(item.id);
    setNotice(null);
    try {
      await api(`/v1/admin/search/phrases/${item.id}`, { method: "DELETE", response: z.unknown() });
      setPhrases((list) => list.filter((other) => other.id !== item.id));
      setNotice({ tone: "success", title: "Phrase removed", body: `“${item.phrase}” no longer has its own match. Recorded in the audit log.` });
      router.refresh();
    } catch {
      setNotice({ tone: "error", title: "Not removed", body: "Check your connection and try again." });
    } finally {
      setRemoving(null);
    }
  };

  const summary = Object.entries(errors).map(([key, message]) => ({ fieldId: key === "phrase" ? "phrase-text" : "phrase-target", message }));
  return (
    <>
      <section className={c.panel} aria-labelledby="phrase-add-title">
        <h2 id="phrase-add-title" className={c.panelTitle}>
          Add a phrase
        </h2>
        <p className={c.hint}>When a customer searches these words, the page you choose comes first.</p>
        {notice ? (
          <Notice tone={notice.tone} title={notice.title} live>
            <p>{notice.body}</p>
          </Notice>
        ) : null}
        {summary.length ? <ErrorSummary errors={summary} /> : null}
        <form noValidate onSubmit={add} className={c.editorCol}>
          <div className={c.phraseForm}>
            <FormField label="Phrase" id="phrase-text" error={errors.phrase} hint="e.g. staff uniforms">
              <TextField value={phrase} maxLength={60} onChange={(event) => setPhrase(event.target.value)} />
            </FormField>
            <FormField label="Leads to" id="phrase-target" error={errors.targetId ?? errors.targetType} hint={target ? `${KIND[target.type]} · ${target.detail}` : "Type a product, category or page name."}>
              <TextField
                value={query}
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setTarget(null);
                }}
              />
            </FormField>
          </div>
          {options.length ? (
            <ul className={c.options} aria-label="Matching pages">
              {options.slice(0, 8).map((option) => (
                <li key={`${option.type}-${option.id}`}>
                  <button
                    type="button"
                    className={c.option}
                    aria-pressed={target?.id === option.id}
                    onClick={() => {
                      setTarget(option);
                      setQuery(option.label);
                      setOptions([]);
                    }}
                  >
                    {option.label}
                    <span className={c.optionDetail}>
                      {KIND[option.type]} · {option.detail}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className={c.actions}>
            <Button type="submit" loading={busy}>
              Add phrase
            </Button>
          </div>
        </form>
      </section>
      {phrases.length ? (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Search phrases, newest first</caption>
          <thead>
            <tr>
              <th scope="col">PHRASE</th>
              <th scope="col">LEADS TO</th>
              <th scope="col">ADDED</th>
              <th scope="col">
                <span className="hp-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {phrases.map((item) => (
              <tr key={item.id}>
                <td className={styles.strong}>{item.phrase}</td>
                <td>
                  <a className={styles.action} href={item.target.href} target="_blank" rel="noopener">
                    {item.target.label}
                  </a>{" "}
                  <span className={c.meta}>{KIND[item.target.type]}</span>
                </td>
                <td className={styles.mono}>{item.createdBy ?? "—"}</td>
                <td>
                  <button type="button" className={c.textButton} disabled={removing === item.id} onClick={() => void remove(item)} aria-label={`Remove “${item.phrase}”`}>
                    <Trash2 size={16} aria-hidden="true" />
                    {removing === item.id ? "Removing…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={c.hint}>No phrases yet. Ordinary search already finds products, categories and pages by name.</p>
      )}
    </>
  );
}
