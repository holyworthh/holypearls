import { adminProofQueueSchema, changeRequestListSchema } from "@holypearls/contracts";
import { EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";
import { ChangeDecision } from "./ChangeDecision";
import { FileDecision } from "./FileDecision";
import { money } from "../format";

export const PROOF_TONE: Record<string, "info" | "warning" | "success" | "neutral"> = {
  PREPARING: "info",
  REVISION_IN_PROGRESS: "info",
  CHANGES_REQUESTED: "warning",
  AWAITING_APPROVAL: "neutral",
  APPROVED: "success",
  NOT_REQUIRED: "neutral",
};

/** Proofs to prepare and files needing review (Pen 112 · ebdTq: queue VwOBV, states ElNrb; OPS-FR-050–051). PROOF_MANAGE. */
export default async function ProofsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PROOF_MANAGE")) return <PermissionDenied permission="PROOF_MANAGE" />;
  const requested = (await searchParams).view;
  const view = requested === "approved" ? "approved" : requested === "changes" ? "changes" : "open";
  if (view === "changes") return <ChangeRequests />;
  const queue = await serverApi(`/v1/admin/proofs${view === "approved" ? "?view=approved" : ""}`, adminProofQueueSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / ORDERS / PROOFS &amp; ARTWORK</p>
        <h1 className={styles.title}>Proofs and artwork</h1>
      </header>
      <nav className={styles.tabs} aria-label="Proofs">
        <a className={styles.tab} href="/proofs" aria-current={view === "open" ? "page" : undefined}>
          Proofs to prepare{queue.ok && view === "open" ? ` · ${queue.data.proofs.length}` : ""}
        </a>
        <a className={styles.tab} href="/proofs?view=approved" aria-current={view === "approved" ? "page" : undefined}>
          Approved
        </a>
        <a className={styles.tab} href="/proofs?view=changes">
          Change requests
        </a>
      </nav>
      {!queue.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={queue.error.requestId} />
      ) : (
        <>
          {queue.data.proofs.length === 0 ? (
            <EmptyState title={view === "open" ? "No proofs to prepare" : "No approved proofs yet"} body="Proofs appear here when an order is placed for a product that needs one." />
          ) : (
            <table className={styles.table}>
              <caption className="hp-visually-hidden">Proofs, oldest first</caption>
              <thead>
                <tr>
                  <th scope="col">ORDER / ITEM</th>
                  <th scope="col">PRODUCT</th>
                  <th scope="col">VERSION</th>
                  <th scope="col">STATUS</th>
                  <th scope="col">CHANGED</th>
                </tr>
              </thead>
              <tbody>
                {queue.data.proofs.map((proof) => (
                  <tr key={proof.id}>
                    <td>
                      <a className={styles.action} href={`/proofs/${proof.id}`}>
                        {proof.orderNumber} · {proof.itemPosition}
                      </a>
                    </td>
                    <td>
                      {proof.itemName} × {proof.quantity.toLocaleString("en-NG")}
                    </td>
                    <td className={styles.mono}>{proof.latestVersion ? `V${proof.latestVersion}` : "—"}</td>
                    <td>
                      <StatusChip tone={PROOF_TONE[proof.status] ?? "neutral"}>{proof.status}</StatusChip>
                    </td>
                    <td className={styles.mono}>{ago(proof.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <section className={styles.panel} aria-labelledby="files-title">
            <p className={styles.eyebrow}>FILES NEEDING CLEANUP OR REVIEW</p>
            <h2 id="files-title" className={styles.panelTitle}>
              Artwork review ({queue.data.files.length})
            </h2>
            {queue.data.files.length === 0 ? (
              <p className={styles.hint}>No files need review. New uploads appear here after processing.</p>
            ) : (
              <table className={styles.table}>
                <caption className="hp-visually-hidden">Files needing review</caption>
                <thead>
                  <tr>
                    <th scope="col">FILE</th>
                    <th scope="col">FOR</th>
                    <th scope="col">UPLOADED</th>
                    <th scope="col">STATUS</th>
                    <th scope="col">DECISION</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.files.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <strong className={styles.strong}>{file.name}</strong>
                        {file.reason ? <span className={styles.hint}> · {file.reason}</span> : null}
                      </td>
                      <td>{file.owner}</td>
                      <td className={styles.mono}>{ago(file.uploadedAt)}</td>
                      <td>
                        <StatusChip tone={file.status === "NEEDS_REVIEW" ? "warning" : "info"}>{file.status}</StatusChip>
                      </td>
                      <td>{file.status === "NEEDS_REVIEW" ? <FileDecision fileId={file.id} name={file.name} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}

/** Changes asked for after approval (OPS-FR-054): open and under review, oldest first. */
async function ChangeRequests() {
  const list = await serverApi("/v1/admin/change-requests", changeRequestListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / ORDERS / PROOFS &amp; ARTWORK</p>
        <h1 className={styles.title}>Change requests</h1>
      </header>
      <nav className={styles.tabs} aria-label="Proofs">
        <a className={styles.tab} href="/proofs">
          Proofs to prepare
        </a>
        <a className={styles.tab} href="/proofs?view=approved">
          Approved
        </a>
        <a className={styles.tab} href="/proofs?view=changes" aria-current="page">
          Change requests{list.ok ? ` · ${list.data.items.length}` : ""}
        </a>
      </nav>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No change requests" body="Changes customers ask for after approving a proof appear here." />
      ) : (
        <ul className={styles.plainList}>
          {list.data.items.map((request) => (
            <li key={request.id} className={styles.panel}>
              <p className={styles.eyebrow}>
                {request.orderNumber} · {request.item ?? "Order"} · {request.stage === "BEFORE_PRODUCTION" ? "BEFORE PRODUCTION" : "AFTER PRODUCTION STARTED"}
              </p>
              <h2 className={styles.panelTitle}>{request.description}</h2>
              <div className={styles.chips}>
                <StatusChip tone={request.status === "OPEN" ? "warning" : "info"}>{request.status}</StatusChip>
                <span className={styles.hint}>
                  {ago(request.createdAt)} ago
                  {request.costImpactMinor ? ` · cost ${money(request.costImpactMinor, "NGN")}` : ""}
                </span>
                {request.proofId ? (
                  <a className={styles.action} href={`/proofs/${request.proofId}`}>
                    Open proof
                  </a>
                ) : null}
              </div>
              <ChangeDecision request={request} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
