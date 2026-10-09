"use client";

import { type AnswerConflict, ApiError, type Configuration, configurationSchema } from "@holypearls/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, errorCode, errorReason } from "@holypearls/web-kit/api";

const updateResponse = z.object({ draft: configurationSchema, removed: z.array(z.object({ option: z.string(), value: z.string(), message: z.string() })) });

export type SaveState = "idle" | "saving" | "saved" | "failed";
export type DraftPatch = Record<string, unknown>;

/**
 * Autosave for a configuration draft (COM-FR-012, 013): changes are queued,
 * sent one save at a time with the latest version, the draft is created on
 * the first change, and a failed save keeps the work and retries.
 */
export function useDraft(productSlug: string, initial: Configuration | null, startChoices: Record<string, string>) {
  const [draft, setDraft] = useState<Configuration | null>(initial);
  const [saveState, setSaveState] = useState<SaveState>(initial ? "saved" : "idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ list: AnswerConflict[]; patch: DraftPatch } | null>(null);
  const draftRef = useRef(initial);
  const pending = useRef<DraftPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const apply = (next: Configuration) => {
    draftRef.current = next;
    setDraft(next);
  };

  const save = async (confirmRemovals: boolean) => {
    const change = pending.current;
    pending.current = {};
    if (!Object.keys(change).length) return;
    setSaveState("saving");
    try {
      if (!draftRef.current) {
        const created = await api("/v1/configurations", {
          method: "POST",
          body: { productSlug, choices: { ...startChoices, ...((change.choices as Record<string, string>) ?? {}) } },
          response: configurationSchema,
        });
        apply(created);
        window.history.replaceState(null, "", `?draft=${created.id}`);
        const { choices: _choices, ...rest } = change;
        void _choices;
        if (Object.keys(rest).length) {
          pending.current = { ...rest, ...pending.current };
          await save(false);
          return;
        }
      } else {
        const result = await api(`/v1/configurations/${draftRef.current.id}`, {
          method: "PATCH",
          body: { version: draftRef.current.version, ...change, confirmRemovals },
          response: updateResponse,
        });
        apply(result.draft);
        if (result.removed.length) setNotice(`Removed: ${result.removed.map((item) => item.message).join(" ")}`);
      }
      setSaveState("saved");
    } catch (error) {
      if (errorCode(error) === "VERSION_CONFLICT" && error instanceof ApiError) {
        const latest = configurationSchema.safeParse(error.body.context?.latest);
        if (latest.success) apply(latest.data);
        setNotice("This design was changed in another tab. We've loaded the latest version; check your choices.");
        setSaveState("saved");
      } else if (errorReason(error) === "ANSWERS_CONFLICT" && error instanceof ApiError) {
        setConflicts({ list: (error.body.context?.conflicts as AnswerConflict[]) ?? [], patch: change });
        setSaveState("saved");
      } else if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
        setNotice(Object.values(error.body.fieldErrors ?? {})[0] ?? "That answer isn't available.");
        setSaveState("saved");
      } else {
        pending.current = { ...change, ...pending.current };
        setSaveState("failed");
      }
    }
  };

  const flush = useCallback((confirmRemovals = false) => {
    chain.current = chain.current.then(() => save(confirmRemovals));
    return chain.current;
  }, []);

  const queue = useCallback(
    (change: DraftPatch, delay = 500) => {
      const merged: DraftPatch = { ...pending.current, ...change };
      if (change.choices || pending.current.choices) merged.choices = { ...(pending.current.choices as object), ...(change.choices as object) };
      if (change.details || pending.current.details) merged.details = { ...(pending.current.details as object), ...(change.details as object) };
      pending.current = merged;
      // A change waiting to be sent isn't saved yet, so "Saved" mustn't show while it waits.
      setSaveState((state) => (state === "failed" ? state : "saving"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  useEffect(() => {
    if (saveState !== "failed") return;
    const retry = setTimeout(() => void flush(), 5_000);
    return () => clearTimeout(retry);
  }, [saveState, flush]);

  /** Makes sure the draft exists (for uploads that attach to it), then returns it. */
  const ensure = useCallback(async () => {
    if (!draftRef.current) {
      pending.current = { ...pending.current, step: pending.current.step ?? "artwork" };
      await flush();
    }
    await chain.current;
    return draftRef.current;
  }, [flush]);

  const resolveConflicts = async (remove: boolean) => {
    if (conflicts && remove) {
      pending.current = conflicts.patch;
      await flush(true);
    }
    setConflicts(null);
  };

  return { draft, apply, saveState, notice, setNotice, conflicts, resolveConflicts, queue, flush, ensure, draftRef };
}
