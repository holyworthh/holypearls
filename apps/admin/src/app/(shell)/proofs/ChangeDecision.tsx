"use client";

import { ApiError, type ChangeRequest, changeRequestSchema } from "@holypearls/contracts";
import { Button, FormField, Select, TextArea, TextField } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../admin-list.module.css";

/**
 * Review a change asked for after approval (OPS-FR-054): record the cost and
 * timing impact and a note for the customer. Accepting can start a new proof
 * version (the approved one is kept) or note a quote revision.
 */
export function ChangeDecision({ request }: { request: ChangeRequest }) {
  const router = useRouter();
  const [decision, setDecision] = useState<"ACCEPTED" | "DECLINED">("ACCEPTED");
  const [outcome, setOutcome] = useState<"NEW_PROOF_VERSION" | "QUOTE_REVISION" | "NONE">("NEW_PROOF_VERSION");
  const [cost, setCost] = useState("");
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const review = async () => {
    setBusy(true);
    try {
      await api(`/v1/admin/change-requests/${request.id}/review`, { method: "POST", response: changeRequestSchema });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const decide = async () => {
    const naira = cost.replaceAll(",", "").trim();
    if (naira && !/^-?\d+(\.\d{1,2})?$/.test(naira)) {
      setError("Enter the cost change in naira, for example 15000 or -2000.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/admin/change-requests/${request.id}/decision`, {
        method: "POST",
        body: {
          version: request.version,
          decision,
          outcome: decision === "DECLINED" ? "NONE" : outcome,
          costImpactMinor: naira ? String(Math.round(Number(naira) * 100)) : null,
          timingImpactDays: days.trim() ? Number(days) : null,
          note,
        },
        response: changeRequestSchema,
      });
      router.refresh();
    } catch (problem) {
      setError(problem instanceof ApiError ? (problem.body.fieldErrors ? Object.values(problem.body.fieldErrors).join(" ") : problem.body.message) : "We couldn't save the decision.");
    } finally {
      setBusy(false);
    }
  };

  if (request.status === "OPEN") {
    return (
      <Button type="button" variant="secondary" loading={busy} onClick={() => void review()}>
        Start review
      </Button>
    );
  }
  return (
    <div className={styles.panel}>
      <div className={styles.filters}>
        <FormField id={`decision-${request.id}`} label="Decision">
          <Select
            value={decision}
            options={[
              { value: "ACCEPTED", label: "Accept" },
              { value: "DECLINED", label: "Decline (approved version stays)" },
            ]}
            onChange={(event) => setDecision(event.target.value as "ACCEPTED" | "DECLINED")}
          />
        </FormField>
        {decision === "ACCEPTED" ? (
          <FormField id={`outcome-${request.id}`} label="Then">
            <Select
              value={outcome}
              options={[
                { value: "NEW_PROOF_VERSION", label: "Start a new proof version" },
                { value: "QUOTE_REVISION", label: "Revise the quote" },
                { value: "NONE", label: "No new version needed" },
              ]}
              onChange={(event) => setOutcome(event.target.value as typeof outcome)}
            />
          </FormField>
        ) : null}
      </div>
      <div className={styles.filters}>
        <FormField id={`cost-${request.id}`} label="Cost change (₦)" optional>
          <TextField inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
        </FormField>
        <FormField id={`days-${request.id}`} label="Timing change (working days)" optional>
          <TextField inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value.replace(/[^\d-]/g, ""))} />
        </FormField>
      </div>
      <FormField id={`note-${request.id}`} label="Note for the customer" error={error ?? undefined}>
        <TextArea rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
      <Button type="button" loading={busy} onClick={() => void decide()}>
        Save decision
      </Button>
    </div>
  );
}
