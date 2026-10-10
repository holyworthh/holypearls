"use client";

import { IDEMPOTENCY_KEY_HEADER, type OrderDraftState, orderDraftStateSchema } from "@holypearls/contracts";
import { Button, Notice } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { useState } from "react";
import styles from "./workspace.module.css";

/**
 * The Order Draft (Pen 133 · g6AgmQ desktop, fwDAU 375): totals by size,
 * personalisation and location, then submit. Submitting sends an order
 * request (when the organization's approval rule applies) or a quote request
 * to HolyPearls; closing never starts production.
 */
export function OrderDraftPanel({ organizationId, collectionId, status, version, initial }: { organizationId: string; collectionId: string; status: string; version: number; initial: OrderDraftState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string>();
  const [key] = useState(() => newIdempotencyKey());
  const base = `/v1/organizations/${organizationId}/collections/${collectionId}/order-draft`;
  const draft = state.current;

  const run = async (name: string, call: () => Promise<OrderDraftState>) => {
    setBusy(name);
    setFailure(undefined);
    try {
      setState(await call());
      // The collection's status moved: the page shows it after a reload.
      if (name === "make") window.location.reload();
    } catch (error) {
      setFailure(errorCode(error) === "VERSION_CONFLICT" ? "Something changed. Reload the page." : errorReason(error) === "NOT_READY" ? "Fix or leave out the rows that need attention first." : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!draft && status !== "READY_TO_ORDER") {
    return state.stale ? (
      <Notice tone="info" title="Order Draft marked STALE">
        <p>You reopened the collection, so the Order Draft must be made again after you close it.</p>
      </Notice>
    ) : null;
  }
  return (
    <section className={styles.detail} aria-labelledby="draft-title">
      <h2 id="draft-title" className={styles.detailTitle}>
        Order Draft
      </h2>
      {failure ? (
        <Notice tone="error" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      {!draft ? (
        <>
          <p className={styles.dialogText}>Everyone in the order has answered. Make the Order Draft to see the totals HolyPearls will quote.</p>
          <Button loading={busy === "make"} onClick={() => void run("make", () => api(base, { method: "POST", body: { version }, response: orderDraftStateSchema }))}>
            Make the Order Draft
          </Button>
        </>
      ) : (
        <>
          <div className={styles.groupTop}>
            <div>
              <p className={styles.detailLabel}>Totals by size</p>
              <ul className={styles.detailValue}>
                {draft.sizes.map((item) => (
                  <li key={item.size}>
                    Size {item.size} · {item.count}
                  </li>
                ))}
              </ul>
              <p className={styles.detailLabel}>
                Total {draft.pieces}
                {draft.excludedCount ? ` (${draft.excludedCount} ${draft.excludedCount === 1 ? "row" : "rows"} excluded)` : ""}
              </p>
            </div>
            <div>
              <p className={styles.detailLabel}>By personalisation and location</p>
              <ul className={styles.detailValue}>
                <li>With names · {draft.withNames}</li>
                {draft.delivery.map((item) => (
                  <li key={item.name}>
                    {item.name} · {item.count}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {draft.status === "SUBMITTED" ? (
            <Notice tone="success" title="Sent">
              <p>
                {draft.route === "APPROVAL" ? (
                  <>
                    Waiting for your organization&apos;s approval.{" "}
                    <a className={styles.rowLink} href={`/workspace/${organizationId}/approvals/${draft.orderRequestId}`}>
                      Open the request
                    </a>
                  </>
                ) : (
                  `With HolyPearls for a quote (${draft.quoteReference}).`
                )}
              </p>
            </Notice>
          ) : (
            <>
              <p className={styles.dialogText}>Next step: submitting sends an order request (or quote request) to HolyPearls. Closing doesn&apos;t start production.</p>
              <Button loading={busy === "submit"} onClick={() => void run("submit", () => api(`${base}/submit`, { method: "POST", body: { version: draft.version }, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: orderDraftStateSchema }))}>
                Submit the Order Draft
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
