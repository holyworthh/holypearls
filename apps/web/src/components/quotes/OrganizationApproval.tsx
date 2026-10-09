"use client";

import { orderRequestSchema, type QuoteOrganizationApproval } from "@holypearls/contracts";
import { Button, FormField, Notice, StatusChip, TextArea } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { naira } from "@holypearls/web-kit/money";
import { useState } from "react";
import s from "./quote.module.css";

/**
 * The organization's approval against this quote (T11-04b; Pen 48 · Oe5Uk;
 * QUOTE-FR-020–022): what it approved, the current quote and the
 * difference. Above the approved amount, accepting waits for a new approval;
 * HolyPearls' quote itself is unchanged.
 */
export function OrganizationApprovalSummary({ approval }: { approval: QuoteOrganizationApproval }) {
  if (!approval.reapprovalRequired && !approval.reapprovalPending) return null;
  return (
    <section className={s.orgApproval} aria-labelledby="org-approval-title">
      <h2 id="org-approval-title" className={s.h2}>
        {approval.reapprovalPending ? `Waiting for ${approval.organizationName} to approve the new total` : "New approval needed before you can accept"}
      </h2>
      <p className={s.muted}>The quote changed after {approval.organizationName} approved it. Its policy needs a new approval for the difference. HolyPearls&apos; quote below is unchanged.</p>
      <dl className={s.orgFigures}>
        <div>
          <dt>{approval.organizationName} approved</dt>
          <dd className={s.strong}>{naira(approval.approvedMinor)}</dd>
          {approval.approvedBy ? <dd className={s.muted}>Approved by {approval.approvedBy}</dd> : null}
        </div>
        <div>
          <dt>Current HolyPearls quote</dt>
          <dd className={s.strong}>{naira(approval.quoteTotalMinor)}</dd>
        </div>
        {approval.differenceMinor ? (
          <div>
            <dt>Difference</dt>
            <dd className={s.strong}>+{naira(approval.differenceMinor)}</dd>
            <dd className={s.muted}>Above the approved amount</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

/** "Send for reapproval" in the decision rail (Pen 48). */
export function SendForReapproval({ approval }: { approval: QuoteOrganizationApproval }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (!approval.canSendForReapproval && !sent) return approval.reapprovalRequired || approval.reapprovalPending ? <StatusChip tone="warning">REAPPROVAL REQUIRED</StatusChip> : null;
  const send = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await api(`/v1/organizations/${approval.organizationId}/order-requests/${approval.requestId}/reapproval`, { method: "POST", body: { note: note.trim() || null, version: approval.version }, response: orderRequestSchema });
      setSent(true);
    } catch (error) {
      setFailure(errorCode(error) === "VERSION_CONFLICT" ? "This request changed. Reload the page." : "We couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <Notice tone="success" live>
        <p>Sent for re-approval. Accept unlocks once {approval.organizationName} approves {naira(approval.quoteTotalMinor)}.</p>
      </Notice>
    );
  }
  return (
    <div className={s.reapproval}>
      <StatusChip tone="warning">REAPPROVAL REQUIRED</StatusChip>
      <p className={s.muted}>Send this quote to {approval.organizationName}&apos;s approvers for the new total.</p>
      <FormField id="reapproval-note" label="Add a note (optional)" hint="For example: installation added at the venue's request">
        <TextArea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
      {failure ? (
        <Notice tone="error" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      <Button loading={busy} onClick={() => void send()}>
        Send for reapproval
      </Button>
    </div>
  );
}
