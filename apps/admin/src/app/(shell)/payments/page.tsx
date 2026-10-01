import { adminPaymentListSchema } from "@holypearls/contracts";
import { Button, ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { formatTime, money } from "../format";
import { ATTEMPT_TONE, CUSTOMER_TONE, PaymentsTabs, shortReference } from "./PaymentsTabs";

const STATUSES = ["", "SUCCEEDED", "PENDING", "FAILED", "ABANDONED", "UNKNOWN", "CREATED"] as const;

type Search = { status?: string; q?: string; cursor?: string };

const withParams = (params: Search, changes: Partial<Search>) => {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) if (value) next.set(key, value);
  const query = next.toString();
  return `/payments${query ? `?${query}` : ""}`;
};

/** Payments list (Pen 109 · iPVvj: list HipdO, states eUKwI; OPS-FR-041). */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PAYMENT_VIEW")) return <PermissionDenied permission="PAYMENT_VIEW" />;
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.cursor) query.set("cursor", params.cursor);
  const page = await serverApi(`/v1/admin/payments?${query}`, adminPaymentListSchema);
  const filtered = Boolean(params.status || params.q);

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>PAYSTACK · NGN AND USD (IF ENABLED)</p>
        <h1 className={styles.title}>Payments</h1>
      </header>
      <PaymentsTabs current="list" openReviews={page.ok ? page.data.openReviews : null} />

      {page.ok && page.data.paymentsPaused ? (
        <div className={styles.notice} role="status">
          <StatusChip tone="warning">Payments paused</StatusChip> <span className={styles.hint}>New attempts are blocked. Pending attempts are still checked.</span>
        </div>
      ) : null}

      <form className={styles.filters} action="/payments" role="search" aria-label="Filter payments">
        <label className={styles.search}>
          <span className="hp-visually-hidden">Search</span>
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input name="q" defaultValue={params.q} placeholder="HPPAY reference, order or customer" />
        </label>
        <label className={styles.select}>
          <span className="hp-visually-hidden">Status</span>
          <select name="status" defaultValue={params.status ?? ""}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                Status: {status || "All"}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <span className={styles.spacer} />
        {filtered ? (
          <a className={styles.clear} href="/payments">
            Clear filters
          </a>
        ) : null}
      </form>

      {!page.ok ? (
        <ErrorState
          title="We couldn't load this list"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={page.error.requestId}
          action={
            <ButtonLink variant="secondary" href={withParams(params, {})}>
              Try again
            </ButtonLink>
          }
        />
      ) : page.data.items.length === 0 ? (
        <EmptyState title={filtered ? "No payments match these filters" : "No payments yet"} body={filtered ? "Try another status or date." : "Payment attempts appear here as customers pay."} />
      ) : (
        <div className={styles.tableCol}>
          <table className={styles.table}>
            <caption className="hp-visually-hidden">Payment attempts, newest first</caption>
            <thead>
              <tr>
                <th scope="col">REFERENCE</th>
                <th scope="col">FOR</th>
                <th scope="col">CUSTOMER</th>
                <th scope="col">AMOUNT</th>
                <th scope="col">ATTEMPT</th>
                <th scope="col">CUSTOMER SEES</th>
              </tr>
            </thead>
            <tbody>
              {page.data.items.map((row) => (
                <tr key={row.attemptId}>
                  <td className={styles.mono}>
                    <a className={styles.action} href={`/payments/intents/${row.intentId}`} title={row.reference}>
                      {shortReference(row.reference)}
                    </a>
                    <span className="hp-visually-hidden"> {formatTime(row.createdAt)}</span>
                  </td>
                  <td className={styles.mono}>{row.forLabel}</td>
                  <td>{row.customer}</td>
                  <td className={styles.mono}>{money(row.amountMinor, row.currency)}</td>
                  <td>
                    <StatusChip tone={ATTEMPT_TONE[row.attemptStatus]}>{row.attemptStatus}</StatusChip>
                  </td>
                  <td>{row.customerSees ? <StatusChip tone={CUSTOMER_TONE[row.customerSees] ?? "neutral"}>{row.customerSees}</StatusChip> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav className={styles.pagination} aria-label="Payment pages">
            <span className={styles.count}>Showing {page.data.items.length} attempts</span>
            <span className={styles.spacer} />
            {params.cursor ? (
              <a className={styles.pageLink} href={withParams(params, { cursor: undefined })}>
                ‹ Newest
              </a>
            ) : null}
            {page.data.nextCursor ? (
              <a className={styles.pageLink} href={withParams(params, { cursor: page.data.nextCursor })}>
                Next ›
              </a>
            ) : null}
          </nav>
        </div>
      )}
    </>
  );
}
