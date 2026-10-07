"use client";

import { ApiError, reorderResultSchema } from "@holypearls/contracts";
import { Button, ButtonLink, Notice } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, newIdempotencyKey } from "@holypearls/web-kit/api";
import s from "./forms.module.css";

/** Reorder exactly (to the cart) or with changes (a new draft to edit), Pen 128. */
export function ReorderActions({ orderId, position, exact, withChanges }: { orderId: string; position: number; exact: boolean; withChanges: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"EXACT" | "WITH_CHANGES" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => newIdempotencyKey());

  const go = async (mode: "EXACT" | "WITH_CHANGES") => {
    setBusy(mode);
    setError(null);
    try {
      const result = await api(`/v1/orders/${orderId}/items/${position}/reorder`, { method: "POST", body: { mode }, headers: { "idempotency-key": `${key}_${mode}` }, response: reorderResultSchema });
      router.push(result.next);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.body.message : "We couldn't start the reorder. Try again.");
      setBusy(null);
    }
  };

  return (
    <>
      {error ? (
        <Notice tone="error" live>
          {error}
        </Notice>
      ) : null}
      <div className={s.actions}>
        {exact ? (
          <Button type="button" loading={busy === "EXACT"} disabled={busy !== null} onClick={() => void go("EXACT")}>
            Reorder exactly
          </Button>
        ) : null}
        {withChanges ? (
          <Button type="button" variant={exact ? "secondary" : "primary"} loading={busy === "WITH_CHANGES"} disabled={busy !== null} onClick={() => void go("WITH_CHANGES")}>
            Reorder with changes
          </Button>
        ) : (
          <ButtonLink href="/start" variant="secondary">
            Start a project
          </ButtonLink>
        )}
      </div>
      {withChanges ? <p className={s.hint}>Want to change anything? Use Reorder with changes; it goes back through checks and proofing. Your original order stays as it is.</p> : null}
    </>
  );
}
