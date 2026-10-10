import { orderDraftOriginSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";

/**
 * Where a group Order Draft came from (Pen 133 · u3BRd; OPS-FR-090): how many
 * pieces came from participant links and which imports, and which rows the
 * organizer left out. Read only: staff don't edit participants unless the
 * organization asks for help. QUOTE_MANAGE, reached from the quote.
 */
export default async function OrderDraftOriginPage({ params }: { params: Promise<{ draftId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("QUOTE_MANAGE")) return <PermissionDenied permission="QUOTE_MANAGE" />;
  const { draftId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(draftId)) notFound();
  const origin = await serverApi(`/v1/admin/order-drafts/${draftId}`, orderDraftOriginSchema);
  if (!origin.ok) {
    if (origin.status === 404) notFound();
    return <ErrorState title="We couldn't load this Order Draft" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={origin.error.requestId} />;
  }
  const draft = origin.data;
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>
          ORDER DRAFT · {draft.status} · {draft.organizationName.toUpperCase()}
        </p>
        <h1 className={styles.title}>Where these {draft.pieces} pieces came from</h1>
        <p className={styles.hint}>
          {draft.collectionTitle}
          {draft.quoteReference ? ` · quote ${draft.quoteReference}` : ""}
        </p>
      </header>
      <section className={styles.panel} aria-labelledby="origin-title">
        <h2 id="origin-title" className={styles.panelTitle}>
          Sources
        </h2>
        <ul className={styles.plainList}>
          <li className={styles.hint}>
            <span className={styles.strong}>{draft.fromLink} participant submissions</span> · guest link · SUBMITTED
          </li>
          {draft.fromImports.map((item) => (
            <li key={item.name} className={styles.hint}>
              <span className={styles.strong}>{item.count} rows from import</span> {item.name}
            </li>
          ))}
          {draft.excluded.length ? (
            <li className={styles.hint}>
              <span className={styles.strong}>{draft.excluded.length} rows excluded by the organizer</span> · {draft.excluded.map((row) => `${row.name} (${row.reason.toLowerCase()})`).join(", ")}
            </li>
          ) : null}
        </ul>
        <p className={styles.hint}>Read-only support view. Staff don&apos;t edit participants unless the organization asks.</p>
      </section>
    </>
  );
}
