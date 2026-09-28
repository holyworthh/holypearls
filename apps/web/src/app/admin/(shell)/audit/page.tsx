import { type AuditEntry, auditEntrySchema, auditPageSchema } from "@holypearls/contracts";
import { Button, ButtonLink, EmptyState, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "../../../../lib/server-api";
import { requireAdmin } from "../admin-session";
import styles from "./audit.module.css";

const ACTIONS: readonly [string, string][] = [
  ["", "All actions"],
  ["staff.permission_granted", "Permission granted"],
  ["staff.permission_revoked", "Permission removed"],
  ["staff.mfa_reset", "MFA reset"],
  ["security.sign_in_failures", "Failed sign-ins"],
  ["security.mfa_enabled", "Authenticator set up"],
  ["security.mfa_disabled", "Authenticator removed"],
  ["security.password_changed", "Password changed"],
  ["security.sessions_revoked", "Signed out everywhere"],
  ["security.session_revoked", "Signed out one device"],
];

const PERIODS: readonly [string, string][] = [
  ["", "All time"],
  ["1", "Last 24 hours"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
];

const time = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Lagos",
});
const formatTime = (iso: string) => time.format(new Date(iso)).replace(",", "").toUpperCase();

/** A short reference for an entry, shown to staff (the ID itself is a UUID). */
const entryRef = (id: string) => `AL-${id.replaceAll("-", "").slice(-6).toUpperCase()}`;

const recordLine = (entry: AuditEntry) =>
  [entry.recordType, entry.recordLabel ?? entry.recordId ?? "—"].join(" · ").toUpperCase();

function describe(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1 && Array.isArray(entries[0]![1])) return (entries[0]![1] as unknown[]).join(", ") || "None";
  return entries.map(([key, inner]) => `${key}: ${Array.isArray(inner) ? inner.join(", ") : String(inner)}`).join("; ");
}

type Search = { q?: string; action?: string; since?: string; cursor?: string; entry?: string };

const withParams = (params: Search, changes: Partial<Search>) => {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) if (value) next.set(key, value);
  const query = next.toString();
  return `/admin/audit${query ? `?${query}` : ""}`;
};

/** Admin audit viewer (Pen frame 101 · weTNu: viewer nmsXn, states l4tuGM). Read-only. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("AUDIT_VIEW")) return <PermissionDenied permission="AUDIT_VIEW" />;
  const params = await searchParams;

  const query = new URLSearchParams({ limit: "25" });
  if (params.q) query.set("q", params.q);
  if (params.action) query.set("action", params.action);
  if (params.since) query.set("sinceDays", params.since);
  if (params.cursor) query.set("cursor", params.cursor);
  const [page, selected] = await Promise.all([
    serverApi(`/v1/admin/audit?${query}`, auditPageSchema),
    params.entry ? serverApi(`/v1/admin/audit/${encodeURIComponent(params.entry)}`, auditEntrySchema) : null,
  ]);
  const filtered = Boolean(params.q || params.action || params.since);

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>SYSTEM</p>
        <h1 className={styles.title}>Audit log</h1>
      </header>

      <form className={styles.filters} action="/admin/audit" role="search" aria-label="Filter the audit log">
        <label className={styles.search}>
          <span className="hp-visually-hidden">Search</span>
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input name="q" defaultValue={params.q} placeholder="Search by reference or name" />
        </label>
        <label className={styles.select}>
          <span className="hp-visually-hidden">Action</span>
          <select name="action" defaultValue={params.action ?? ""}>
            {ACTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {value ? `Action: ${label}` : label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.select}>
          <span className="hp-visually-hidden">Date</span>
          <select name="since" defaultValue={params.since ?? ""}>
            {PERIODS.map(([value, label]) => (
              <option key={value} value={value}>
                Date: {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <span className={styles.spacer} />
        {filtered ? (
          <a className={styles.clear} href="/admin/audit">
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
          title={filtered ? "No entries for these filters" : "No entries yet"}
          body={filtered ? "Try a different search, action or date." : "Important staff and security actions appear here."}
          action={
            filtered ? (
              <a className={styles.clear} href="/admin/audit">
                Clear filters
              </a>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.columns}>
          <div className={styles.tableCol}>
            <table className={styles.table}>
              <caption className="hp-visually-hidden">Audit entries, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">TIME</th>
                  <th scope="col">ACTOR</th>
                  <th scope="col">ACTION</th>
                  <th scope="col">RECORD</th>
                </tr>
              </thead>
              <tbody>
                {page.data.entries.map((entry) => {
                  const current = entry.id === params.entry;
                  return (
                    <tr key={entry.id} className={current ? styles.selected : undefined}>
                      <td className={styles.mono}>{formatTime(entry.occurredAt)}</td>
                      <td>{entry.actorLabel}</td>
                      <td>
                        <a
                          className={styles.action}
                          href={withParams(params, { entry: entry.id })}
                          aria-current={current ? "true" : undefined}
                        >
                          {entry.summary}
                        </a>
                      </td>
                      <td className={styles.mono}>{recordLine(entry)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <nav className={styles.pagination} aria-label="Audit pages">
              <span className={styles.count}>
                Showing {page.data.entries.length} {page.data.entries.length === 1 ? "entry" : "entries"}
              </span>
              <span className={styles.spacer} />
              {params.cursor ? (
                <a className={styles.pageLink} href={withParams(params, { cursor: undefined, entry: undefined })}>
                  ‹ Newest
                </a>
              ) : null}
              {page.data.nextCursor ? (
                <a
                  className={styles.pageLink}
                  href={withParams(params, { cursor: page.data.nextCursor, entry: undefined })}
                >
                  Next ›
                </a>
              ) : null}
            </nav>
          </div>

          <aside className={styles.detailCol} aria-label="Entry detail">
            {selected?.ok ? (
              <section className={styles.panel} aria-labelledby="entry-title">
                <h2 id="entry-title" className={styles.panelTitle}>
                  Entry {entryRef(selected.data.id)}
                </h2>
                <dl className={styles.fields}>
                  <dt>Action</dt>
                  <dd className={styles.strong}>{selected.data.summary}</dd>
                  {selected.data.permission ? (
                    <>
                      <dt>Permission</dt>
                      <dd>{selected.data.permission}</dd>
                    </>
                  ) : null}
                  <dt>Before</dt>
                  <dd>{describe(selected.data.before)}</dd>
                  <dt>After</dt>
                  <dd>{describe(selected.data.after)}</dd>
                  <dt>Actor</dt>
                  <dd>{selected.data.actorLabel}</dd>
                  <dt>MFA</dt>
                  <dd>{selected.data.mfaVerifiedAt ? `Checked ${formatTime(selected.data.mfaVerifiedAt)}` : "—"}</dd>
                  <dt>Request ID</dt>
                  <dd className={styles.mono}>{selected.data.requestId ?? "—"}</dd>
                </dl>
              </section>
            ) : selected ? (
              <ErrorState title="We couldn't load this entry" requestId={selected.error.requestId} />
            ) : (
              <p className={styles.hint}>Choose an entry to see what changed.</p>
            )}
            <p className={styles.hint}>
              Entries can&apos;t be edited or deleted in the app. No passwords, codes or link secrets are ever stored here.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
