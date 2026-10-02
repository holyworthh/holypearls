"use client";

import { okResultSchema } from "@holypearls/contracts";
import { Button, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Mark READY, or reject with a note the customer sees (Pen 112 mobile "Artwork file decision"; OPS-FR-050). */
export function FileDecision({ fileId, name }: { fileId: string; name: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "READY" | "REJECTED") => {
    if (decision === "REJECTED" && !note.trim()) {
      setError("Add a note to reject: the customer sees it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/admin/files/${fileId}/decision`, { method: "POST", body: { decision, note: note.trim() || undefined }, response: okResultSchema });
      router.refresh();
    } catch {
      setError("We couldn't save that. Reload and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span>
      <TextField aria-label={`Note for ${name} (required to reject)`} placeholder="Note (required to reject)" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      <Button type="button" variant="secondary" loading={busy} onClick={() => void decide("READY")}>
        Mark READY
      </Button>
      <Button type="button" variant="tertiary" onClick={() => void decide("REJECTED")} disabled={busy}>
        Reject file
      </Button>
      {error ? <span role="alert">{error}</span> : null}
    </span>
  );
}
