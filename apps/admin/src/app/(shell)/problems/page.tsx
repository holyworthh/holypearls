import { adminProblemListSchema, PROBLEM_TYPE_LABEL } from "@holypearls/contracts";
import { EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";

const TONE = { NEW: "warning", TRIAGED: "info", CLOSED: "neutral" } as const;

/** Problem reports (Pen 129 · Nqk5y; FUL-FR-070): open first, oldest first. CUSTOMER_SUPPORT. */
export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CUSTOMER_SUPPORT")) return <PermissionDenied permission="CUSTOMER_SUPPORT" />;
  const closed = (await searchParams).view === "closed";
  const list = await serverApi(`/v1/admin/problems${closed ? "?view=closed" : ""}`, adminProblemListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / REQUESTS / PROBLEM REPORTS</p>
        <h1 className={styles.title}>Problem reports</h1>
      </header>
      <nav className={styles.tabs} aria-label="Problem reports">
        <a className={styles.tab} href="/problems" aria-current={closed ? undefined : "page"}>
          Queue{list.ok && !closed ? ` · ${list.data.items.length}` : ""}
        </a>
        <a className={styles.tab} href="/problems?view=closed" aria-current={closed ? "page" : undefined}>
          Closed
        </a>
      </nav>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={closed ? "No closed reports" : "No open problem reports"} body="Reports customers send from their order page appear here." />
      ) : (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Problem reports, oldest first</caption>
          <thead>
            <tr>
              <th scope="col">REPORT</th>
              <th scope="col">ISSUE</th>
              <th scope="col">ORDER</th>
              <th scope="col">STATUS</th>
              <th scope="col">RECEIVED</th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((report) => (
              <tr key={report.id}>
                <td>
                  <a className={styles.action} href={`/problems/${report.id}`}>
                    {report.number} · {report.item}
                  </a>
                </td>
                <td>
                  {PROBLEM_TYPE_LABEL[report.type]} · {report.quantity.toLocaleString("en-NG")}
                </td>
                <td className={styles.mono}>{report.orderNumber}</td>
                <td>
                  <StatusChip tone={TONE[report.status]}>{report.status}</StatusChip>
                </td>
                <td className={styles.mono}>{ago(report.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
