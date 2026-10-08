"use client";

import { type AdminOrganizationRequest, adminOrganizationRequestSchema, ApiError } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, StatusChip, TextArea } from "@holypearls/ui";
import { api, newIdempotencyKey } from "@holypearls/web-kit/api";
import { useState } from "react";
import list from "../../admin-list.module.css";
import { formatTime } from "../../format";

const TONE = { PENDING: "warning", APPROVED: "success", DECLINED: "neutral" } as const;

/** Approve or decline a workspace request. Both are audited and email the requester. */
export function RequestDecision({ initial, canSeeOrganizations }: { initial: AdminOrganizationRequest; canSeeOrganizations: boolean }) {
  const [request, setRequest] = useState(initial);
  const [dialog, setDialog] = useState<"approve" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());

  const decide = async (decision: "approve" | "decline") => {
    if (decision === "decline" && reason.trim().length < 5) {
      setReasonError("Tell the customer why, in a sentence");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const updated = await api(`/v1/admin/organization-requests/${request.id}/${decision}`, {
        method: "POST",
        body: decision === "decline" ? { reason } : {},
        headers: { "idempotency-key": key },
        response: adminOrganizationRequestSchema,
      });
      setRequest(updated);
      setDialog(null);
      setKey(newIdempotencyKey());
      setResult({ tone: "success", text: decision === "approve" ? "Approved. The workspace is ready and the customer has been emailed." : "Declined. The customer has been emailed the reason." });
    } catch (problem) {
      setDialog(null);
      const reasonCode = problem instanceof ApiError ? (problem.body.context?.reason as string | undefined) : undefined;
      setResult({
        tone: "error",
        text:
          reasonCode === "ALREADY_DECIDED"
            ? "Someone already decided this request. Reload to see it."
            : reasonCode === "REQUESTER_UNVERIFIED"
              ? "The requester's email isn't verified, so the workspace can't be created yet."
              : problem instanceof ApiError
                ? problem.body.message
                : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className={list.head}>
        <p className={list.eyebrow}>WORKSPACE REQUEST · RECEIVED {formatTime(request.createdAt)}</p>
        <h1 className={list.title}>{request.companyName}</h1>
        <div className={list.chips}>
          <StatusChip tone={TONE[request.status]}>{request.status}</StatusChip>
          {request.decidedAt ? (
            <span className={list.hint}>
              {request.status === "APPROVED" ? "Approved" : "Declined"} by {request.decidedBy ?? "staff"} · {formatTime(request.decidedAt)}
            </span>
          ) : null}
        </div>
      </header>
      {result ? (
        <Notice tone={result.tone} live>
          {result.text}
        </Notice>
      ) : null}
      <section className={list.panel} aria-labelledby="request-title">
        <h2 id="request-title" className={list.panelTitle}>
          Request
        </h2>
        <dl className={list.fields}>
          <dt>Requested by</dt>
          <dd>
            {request.requester.name} · {request.requester.email}
            {request.requester.emailVerified ? "" : " · email not verified"}
          </dd>
          <dt>Locations</dt>
          <dd>{request.locations.map((location) => `${location.name} (${location.city})`).join(", ")}</dd>
          <dt>Team size</dt>
          <dd>{request.teamSize} people</dd>
          <dt>Note</dt>
          <dd>{request.note ?? "None"}</dd>
          {request.declineReason ? (
            <>
              <dt>Reason given</dt>
              <dd>{request.declineReason}</dd>
            </>
          ) : null}
        </dl>
        {request.status === "PENDING" ? (
          <div className={list.panelActions}>
            <Button type="button" onClick={() => setDialog("approve")}>
              Approve
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDialog("decline")}>
              Decline
            </Button>
          </div>
        ) : request.organizationId && canSeeOrganizations ? (
          <div className={list.panelActions}>
            <a className={list.action} href={`/organizations/${request.organizationId}`}>
              Open the organization
            </a>
          </div>
        ) : null}
      </section>

      <Dialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        title={`Approve ${request.companyName}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void decide("approve")}>
              Approve and create
            </Button>
          </>
        }
      >
        <p className={list.hint}>
          This creates the organization with {request.locations.length} {request.locations.length === 1 ? "location" : "locations"} and makes {request.requester.name} its Owner, with every permission and location. They&apos;ll get an email.
        </p>
      </Dialog>

      <Dialog
        open={dialog === "decline"}
        onClose={() => setDialog(null)}
        title={`Decline ${request.companyName}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => void decide("decline")}>
              Decline and email
            </Button>
          </>
        }
      >
        <FormField id="decline-reason" label="Reason (emailed to the customer)" error={reasonError}>
          <TextArea
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(undefined);
            }}
          />
        </FormField>
      </Dialog>
    </>
  );
}
