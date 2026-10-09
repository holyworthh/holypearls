"use client";

import { type AdminTemplate, adminTemplateSchema, ApiError, IDEMPOTENCY_KEY_HEADER } from "@holypearls/contracts";
import { Button, FormField, Notice, StatusChip, TextArea } from "@holypearls/ui";
import { api, newIdempotencyKey } from "@holypearls/web-kit/api";
import { useState } from "react";
import list from "../../admin-list.module.css";
import { TEMPLATE_TONE } from "../tones";

/** Frame 117: the field table (control and the reason buyers see), the production checks, and the decision. */
export function TemplateDecision({ initial, canSeeOrganization }: { initial: AdminTemplate; canSeeOrganization: boolean }) {
  const [template, setTemplate] = useState(initial);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const waiting = template.status === "AWAITING_APPROVAL";
  const allPass = template.checks.every((check) => check.pass);

  const decide = async (decision: "APPROVE" | "RETURN_TO_DRAFT") => {
    if (decision === "RETURN_TO_DRAFT" && !note.trim()) {
      setNoteError("Tell the organization what to change");
      return;
    }
    setBusy(decision);
    setResult(null);
    try {
      setTemplate(
        await api(`/v1/admin/templates/${template.id}/decision`, {
          method: "POST",
          body: { decision, note: note.trim() || null, version: template.version },
          headers: { [IDEMPOTENCY_KEY_HEADER]: key },
          response: adminTemplateSchema,
        }),
      );
      setResult({ tone: "success", text: decision === "APPROVE" ? "Approved. The organization's allowed locations can order from it now." : "Returned to draft with your note." });
      setNote("");
      setKey(newIdempotencyKey());
    } catch (problem) {
      setResult({ tone: "error", text: problem instanceof ApiError ? problem.body.message : "Try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className={list.head}>
        <p className={list.eyebrow}>
          TEMPLATE · {template.organizationName.toUpperCase()} · {template.productName.toUpperCase()}
        </p>
        <h1 className={list.title}>{template.name}</h1>
        <div className={list.chips}>
          <StatusChip tone={TEMPLATE_TONE[template.status]}>{template.status}</StatusChip>
          <span className={list.hint}>
            {template.createdBy ? `Created by ${template.createdBy} · ` : ""}from {template.sourceLabel} · {template.allLocations ? "All locations" : template.locations.map((location) => location.name).join(", ")}
          </span>
        </div>
        {canSeeOrganization ? (
          <a className={list.action} href={`/organizations/${template.organizationId}`}>
            Open the organization (read only)
          </a>
        ) : null}
      </header>
      {result ? (
        <Notice tone={result.tone} live>
          {result.text}
        </Notice>
      ) : null}
      <table className={list.table}>
        <caption className="hp-visually-hidden">Template fields</caption>
        <thead>
          <tr>
            <th scope="col">FIELD</th>
            <th scope="col">VALUE</th>
            <th scope="col">CONTROL</th>
            <th scope="col">REASON SHOWN TO BUYERS</th>
          </tr>
        </thead>
        <tbody>
          {template.fields.map((field) => (
            <tr key={field.key}>
              <td className={list.strong}>{field.label}</td>
              <td>{field.value}</td>
              <td>{field.control === "LOCKED" ? "Company controlled" : "Buyer editable"}</td>
              <td>{field.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className={list.panel} aria-labelledby="checks-title">
        <h2 id="checks-title" className={list.panelTitle}>
          Production approval (OPS-FR-082)
        </h2>
        <ul className={list.plainList}>
          {template.checks.map((check) => (
            <li key={check.label} className={list.hint}>
              <span className={list.strong}>{check.label}</span> <StatusChip tone={check.pass ? "success" : "error"}>{check.pass ? "Pass" : "Fail"}</StatusChip>
              {check.detail ? ` · ${check.detail}` : ""}
            </li>
          ))}
        </ul>
        {template.reviewNote ? <p className={list.hint}>Last note: {template.reviewNote}</p> : null}
      </section>
      {waiting ? (
        <section className={list.panel} aria-labelledby="decision-title">
          <h2 id="decision-title" className={list.panelTitle}>
            Decision
          </h2>
          <FormField id="template-note" label="Note to the organization (needed to return to draft)" error={noteError}>
            <TextArea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteError(undefined);
              }}
            />
          </FormField>
          <div className={list.panelActions}>
            <Button type="button" loading={busy === "APPROVE"} disabled={!allPass} onClick={() => void decide("APPROVE")}>
              Approve template
            </Button>
            <Button type="button" variant="secondary" loading={busy === "RETURN_TO_DRAFT"} onClick={() => void decide("RETURN_TO_DRAFT")}>
              Return to DRAFT
            </Button>
          </div>
          {!allPass ? <p className={list.hint}>Approval needs every check to pass. Return it to draft with what to change.</p> : null}
        </section>
      ) : null}
    </>
  );
}
