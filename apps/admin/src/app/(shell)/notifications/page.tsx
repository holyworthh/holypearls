import { notificationEntrySchema, notificationPageSchema } from "@holypearls/contracts";
import { Button, ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { formatTime } from "../format";
import { ResendButton } from "./ResendButton";

const TONE = { QUEUED: "neutral", SENT: "info", DELIVERED: "success", FAILED: "error" } as const;
const STATUSES = ["", "QUEUED", "SENT", "DELIVERED", "FAILED"] as const;

type Search = { status?: string; q?: string; cursor?: string; id?: string; resent?: string };

const withParams = (params: Search, changes: Partial<Search>) => {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) if (value) next.set(key, value);
  const query = next.toString();
  return `/notifications${query ? `?${query}` : ""}`;
};

/** Notification log and resend (Pen frame 102 · pfJJO: log xOEwE, states Gls4L). */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CUSTOMER_SUPPORT")) return <PermissionDenied permission="CUSTOMER_SUPPORT" />;
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25" });
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.cursor) query.set("cursor", params.cursor);
  const [page, selected] = await Promise.all([
    serverApi(`/v1/admin/notifications?${query}`, notificationPageSchema),
    params.id ? serverApi(`/v1/admin/notifications/${encodeURIComponent(params.id)}`, notificationEntrySchema) : null,
  ]);
  const filtered = Boolean(params.status || params.q);

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>EMAIL · RESEND (MAILPIT LOCALLY)</p>
        <h1 className={styles.title}>Notification log</h1>
      </header>

      {params.resent ? (
        <div className={styles.notice} role="status">
          <StatusChip tone="success">Email queued again</StatusChip>{" "}
          <span className={styles.hint}>A new notification (QUEUED) was created. Recorded in the audit log.</span>
        </div>
      ) : null}

      <form className={styles.filters} action="/notifications" role="search" aria-label="Filter notifications">
        <label className={styles.search}>
          <span className="hp-visually-hidden">Search</span>
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input name="q" defaultValue={params.q} placeholder="Search by recipient or reference" />
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
          <a className={styles.clear} href="/notifications">
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
              Retry
            </ButtonLink>
          }
        />
      ) : page.data.entries.length === 0 ? (
        <EmptyState
          title={filtered ? "No emails match these filters" : "No emails yet"}
          body="Emails HolyPearls sends appear here with their delivery status."
        />
      ) : (
        <div className={styles.columns}>
          <div className={styles.tableCol}>
            <table className={styles.table}>
              <caption className="hp-visually-hidden">Emails, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">SENT</th>
                  <th scope="col">TEMPLATE</th>
                  <th scope="col">RECIPIENT</th>
                  <th scope="col">RECORD</th>
                  <th scope="col">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {page.data.entries.map((entry) => {
                  const current = entry.id === params.id;
                  return (
                    <tr key={entry.id} className={current ? styles.selected : undefined}>
                      <td className={styles.mono}>{formatTime(entry.lastAttemptAt ?? entry.createdAt)}</td>
                      <td>
                        <a className={styles.action} href={withParams(params, { id: entry.id, resent: undefined })} aria-current={current ? "true" : undefined}>
                          {entry.templateLabel}
                        </a>
                      </td>
                      <td>{entry.recipient}</td>
                      <td className={styles.mono}>{entry.recordLabel ?? "—"}</td>
                      <td>
                        <StatusChip tone={TONE[entry.status]}>{entry.status}</StatusChip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <nav className={styles.pagination} aria-label="Notification pages">
              <span className={styles.count}>Showing {page.data.entries.length} emails</span>
              <span className={styles.spacer} />
              {params.cursor ? (
                <a className={styles.pageLink} href={withParams(params, { cursor: undefined, id: undefined })}>
                  ‹ Newest
                </a>
              ) : null}
              {page.data.nextCursor ? (
                <a className={styles.pageLink} href={withParams(params, { cursor: page.data.nextCursor, id: undefined })}>
                  Next ›
                </a>
              ) : null}
            </nav>
          </div>

          <aside className={styles.detailCol} aria-label="Email detail">
            {selected?.ok ? (
              <section className={styles.panel} aria-labelledby="notification-title">
                <h2 id="notification-title" className={styles.panelTitle}>
                  {selected.data.templateLabel}
                </h2>
                <div>
                  <StatusChip tone={TONE[selected.data.status]}>{selected.data.status}</StatusChip>
                </div>
                <dl className={styles.fields}>
                  <dt>To</dt>
                  <dd>{selected.data.recipient}</dd>
                  <dt>Attempts</dt>
                  <dd>
                    {selected.data.attempts} of {selected.data.maxAttempts}
                    {selected.data.lastAttemptAt ? ` · last ${formatTime(selected.data.lastAttemptAt).slice(-5)}` : ""}
                  </dd>
                  <dt>Provider ID</dt>
                  <dd className={styles.mono}>{selected.data.providerMessageId ?? "—"}</dd>
                  <dt>Error</dt>
                  <dd>{selected.data.lastError ?? "—"}</dd>
                  <dt>Link</dt>
                  <dd>{selected.data.linkLabel ?? "—"}</dd>
                </dl>
                {selected.data.resendable ? (
                  <ResendButton id={selected.data.id} />
                ) : (
                  <p className={styles.hint}>This email held a sign-in link or code, so it can&apos;t be resent. Ask the person to request a new one.</p>
                )}
                <p className={styles.hint}>Resending creates a new notification record. The failed record is kept.</p>
              </section>
            ) : selected ? (
              <ErrorState title="We couldn't load this email" requestId={selected.error.requestId} />
            ) : (
              <p className={styles.hint}>Choose an email to see its delivery attempts.</p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
