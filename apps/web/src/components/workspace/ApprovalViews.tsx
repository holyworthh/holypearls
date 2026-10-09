"use client";

import { APPROVAL_RULE_LABELS, APPROVAL_RULES, type ApprovalPolicy, type ApprovalRule, approvalPolicySchema, ApiError, IDEMPOTENCY_KEY_HEADER, type OrderRequest, orderRequestSchema, type TeamMember } from "@holypearls/contracts";
import { Button, Checkbox, FormField, Notice, RadioCardGroup, TextArea, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { naira } from "@holypearls/web-kit/money";
import { useState } from "react";
import styles from "./workspace.module.css";

const DECISION_MESSAGES: Record<string, string> = {
  SELF_APPROVAL: "You can't approve your own request. Someone else with approval rights needs to decide.",
  NOT_PENDING: "This request isn't waiting for approval any more. Reload to see what changed.",
  REQUESTER_GONE: "The requester has left the workspace. Ask someone to request it again.",
  BLOCKED_CONFIGURATION: "One of the items can't be quoted as it is. Request changes instead.",
};

/** Kobo from what someone typed in naira ("450,000" → "45000000"); null when it isn't an amount. */
const toMinor = (text: string) => {
  const clean = text.replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
};

/**
 * "Your decision" (Pen 72 · hirBW; 73 · mZWyB): the policy line, then
 * Approve, Request changes and Decline, pinned and never hidden in row
 * actions. Approving sends the request to HolyPearls for a quote.
 */
export function ApprovalDecision({ organizationId, initial }: { organizationId: string; initial: OrderRequest }) {
  const [request, setRequest] = useState(initial);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(initial.estimatedTotalMinor ? "" : "");
  const [errors, setErrors] = useState<{ note?: string; amount?: string }>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const base = `/v1/organizations/${organizationId}/order-requests/${request.id}`;
  const firstName = request.requestedBy.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] ?? "the requester";

  const call = async (name: string, run: () => Promise<OrderRequest>) => {
    setBusy(name);
    setFailure(undefined);
    try {
      setRequest(await run());
      setNote("");
      setKey(newIdempotencyKey());
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) setErrors({ note: error.body.fieldErrors.note, amount: error.body.fieldErrors.amountMinor });
      else setFailure(errorCode(error) === "VERSION_CONFLICT" ? "Someone else changed this request. Reload the page." : (DECISION_MESSAGES[errorReason(error) ?? ""] ?? "That didn't work. Try again."));
    } finally {
      setBusy(null);
    }
  };
  const decide = (decision: "APPROVE" | "REQUEST_CHANGES" | "DECLINE") => {
    const problems: typeof errors = {};
    if (decision !== "APPROVE" && !note.trim()) problems.note = `Add a note for ${firstName}`;
    const amountMinor = request.estimatedTotalMinor ? null : toMinor(amount);
    if (decision === "APPROVE" && !request.estimatedTotalMinor && !amountMinor) problems.amount = "Enter the amount you approve, in naira";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    void call(decision, () => api(`${base}/decision`, { method: "POST", body: { decision, amountMinor, note: note.trim() || null, version: request.version }, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: orderRequestSchema }));
  };
  const action = (name: "cancel" | "resubmit") => void call(name, () => api(`${base}/${name}`, { method: "POST", body: { version: request.version }, response: orderRequestSchema }));

  const done =
    request.status === "SENT_TO_HOLYPEARLS" && initial.reapproval
      ? "Approved the new total. The quote can be accepted now."
      : request.status === "SENT_TO_HOLYPEARLS"
      ? `Approved and sent to HolyPearls for a quote${request.quoteReference ? ` (${request.quoteReference})` : ""}.`
      : request.status === "REJECTED"
        ? "Declined."
        : request.status === "CANCELLED"
          ? "Cancelled. The design is a draft again."
          : request.status === "DRAFT"
            ? "Changes requested. The requester can change the design and send it again."
            : null;

  return (
    <aside className={styles.detail} aria-labelledby="decision-title">
      <h2 id="decision-title" className={styles.detailTitle}>
        {request.canDecide ? "Your decision" : "Status"}
      </h2>
      {failure ? (
        <Notice tone="error" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      {done && initial.status !== request.status ? (
        <Notice tone="success" live>
          <p>{done}</p>
        </Notice>
      ) : null}
      {request.policyNote ? <p className={styles.warning}>{request.policyNote}</p> : null}
      {request.decideBlockedReason ? (
        <Notice tone="info">
          <p>{request.decideBlockedReason}</p>
        </Notice>
      ) : null}
      {request.canDecide ? (
        <div className={styles.form}>
          {!request.estimatedTotalMinor ? (
            <FormField id="approve-amount" label="Amount you approve (₦)" hint="There's no price yet. HolyPearls' quote is checked against this." error={errors.amount}>
              <TextField inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </FormField>
          ) : null}
          <Button loading={busy === "APPROVE"} onClick={() => decide("APPROVE")}>
            {request.estimatedTotalMinor ? `Approve ${naira(request.estimatedTotalMinor, request.currency)}` : "Approve"}
          </Button>
          <Button variant="secondary" loading={busy === "REQUEST_CHANGES"} onClick={() => decide("REQUEST_CHANGES")}>
            Request changes
          </Button>
          <Button variant="destructive" loading={busy === "DECLINE"} onClick={() => decide("DECLINE")}>
            Decline
          </Button>
          <FormField id="decision-note" label={`Add a note for ${firstName} (required when declining or asking for changes)`} error={errors.note}>
            <TextArea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
          <p className={styles.dialogText}>
            {request.reapproval ? "Approving lets your workspace accept HolyPearls' quote at the new total." : "Approving sends the request to HolyPearls for a quote. You'll approve again only if the quote is higher than this estimate."}
          </p>
        </div>
      ) : null}
      {request.canResubmit ? (
        <Button loading={busy === "resubmit"} onClick={() => action("resubmit")}>
          Send for approval again
        </Button>
      ) : null}
      {request.canCancel ? (
        <Button variant="tertiary" loading={busy === "cancel"} onClick={() => action("cancel")}>
          Cancel request
        </Button>
      ) : null}
    </aside>
  );
}

/** The approval rule (B2B-FR-040–041): one rule at launch, and "separate requester and approver". Only an Owner changes it. */
export function ApprovalPolicyForm({ organizationId, initial, members }: { organizationId: string; initial: ApprovalPolicy; members: readonly TeamMember[] }) {
  const [policy, setPolicy] = useState(initial);
  const [rule, setRule] = useState<ApprovalRule>(initial.rule);
  const [threshold, setThreshold] = useState(initial.thresholdMinor ? String(Number(initial.thresholdMinor) / 100) : "");
  const [requesters, setRequesters] = useState(initial.requesters.map((person) => person.membershipId));
  const [separate, setSeparate] = useState(initial.separateRequesterApprover);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const thresholdMinor = rule === "ABOVE_AMOUNT" ? toMinor(threshold) : null;
    const problems: Record<string, string> = {};
    if (rule === "ABOVE_AMOUNT" && (!thresholdMinor || thresholdMinor === "0")) problems.thresholdMinor = "Enter the amount above which requests need approval";
    if (rule === "REQUESTERS" && !requesters.length) problems.requesterMembershipIds = "Choose at least one person";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api(`/v1/organizations/${organizationId}/approvals/policy`, {
        method: "PUT",
        body: { rule, thresholdMinor, requesterMembershipIds: rule === "REQUESTERS" ? requesters : [], separateRequesterApprover: separate, version: policy.version },
        response: approvalPolicySchema,
      });
      setPolicy(saved);
      setNotice({ tone: "success", text: "Saved. New requests follow this rule." });
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setNotice({ tone: "error", text: errorCode(error) === "VERSION_CONFLICT" ? "Someone else changed the rule. Reload the page." : "We couldn't save the rule. Try again." });
    } finally {
      setBusy(false);
    }
  };

  if (!policy.canManage) {
    return (
      <section className={styles.detail} aria-labelledby="rule-title">
        <h2 id="rule-title" className={styles.detailTitle}>
          {APPROVAL_RULE_LABELS[policy.rule]}
        </h2>
        <p className={styles.detailValue}>
          {policy.rule === "ABOVE_AMOUNT" ? `Requests above ${naira(policy.thresholdMinor, policy.currency)} need an approver.` : policy.rule === "REQUESTERS" ? `Requests from ${policy.requesters.map((person) => person.name).join(", ")} need an approver.` : policy.rule === "ALL" ? "Every request needs an approver." : "Requests go straight to HolyPearls."}
        </p>
        <p className={styles.dialogText}>{policy.separateRequesterApprover ? "Nobody approves their own request." : "Approvers may approve their own requests."} Only the Owner changes this rule.</p>
      </section>
    );
  }
  return (
    <section className={styles.detail} aria-labelledby="rule-title">
      <h2 id="rule-title" className={styles.detailTitle}>
        Approval rule
      </h2>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      <div className={styles.form}>
        <RadioCardGroup name="approval-rule" legend="When does a request need approval?" value={rule} onChange={(value) => setRule(value as ApprovalRule)} options={APPROVAL_RULES.map((value) => ({ value, title: APPROVAL_RULE_LABELS[value] }))} />
        {rule === "ABOVE_AMOUNT" ? (
          <FormField id="approval-threshold" label="Amount (₦)" hint="Requests above this, or without a price yet, need an approver." error={errors.thresholdMinor}>
            <TextField inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
          </FormField>
        ) : null}
        {rule === "REQUESTERS" ? (
          <fieldset className={styles.choices}>
            <legend>Whose requests need approval</legend>
            {members
              .filter((person) => person.status === "ACTIVE")
              .map((person) => (
                <Checkbox
                  key={person.membershipId}
                  id={`requester-${person.membershipId}`}
                  label={person.name}
                  checked={requesters.includes(person.membershipId)}
                  onChange={(event) => setRequesters(event.target.checked ? [...requesters, person.membershipId] : requesters.filter((id) => id !== person.membershipId))}
                />
              ))}
            {errors.requesterMembershipIds ? (
              <p className={styles.dialogText} role="alert">
                {errors.requesterMembershipIds}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        <Checkbox id="approval-separate" label="Separate requester and approver" hint="Nobody approves their own request, not even an Owner." checked={separate} onChange={(event) => setSeparate(event.target.checked)} />
        <div className={styles.quickActions}>
          <Button loading={busy} onClick={() => void save()}>
            Save rule
          </Button>
        </div>
      </div>
    </section>
  );
}
