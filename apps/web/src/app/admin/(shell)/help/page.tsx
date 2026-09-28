import { adminHelpRequestSchema, type HelpContext, helpInboxSchema } from "@holypearls/contracts";
import { Fragment } from "react";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "../../../../lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";
import { HelpActions } from "./HelpActions";

const TONE = { OPEN: "info", ANSWERED: "success", CLOSED: "neutral" } as const;
const STATUSES = ["OPEN", "ANSWERED", "CLOSED"] as const;

type Search = { status?: string; request?: string; cursor?: string; done?: string };

const where = (context: HelpContext) =>
  [context.product?.label ?? context.page.title, context.step ? `step ${context.step}` : null].filter(Boolean).join(" · ");

/** The context rows staff see, from what the "Need help" button attached. */
function contextRows(context: HelpContext): [string, string][] {
  const rows: [string, string][] = [["Page", where(context)]];
  if (context.configuration) rows.push(["Configuration", [context.configuration.label, context.configuration.summary].filter(Boolean).join(" · ")]);
  if (context.project) rows.push(["Project", context.project.label]);
  if (context.quote) rows.push(["Quote", `${context.quote.label}${context.quote.version ? ` V${context.quote.version}` : ""}`]);
  if (context.proof) rows.push(["Proof", `${context.proof.label}${context.proof.version ? ` V${context.proof.version}` : ""}`]);
  if (context.order) rows.push(["Order", context.order.label]);
  if (context.organization) rows.push(["Organization", [context.organization.label, context.location?.label].filter(Boolean).join(" · ")]);
  if (context.files?.length) rows.push(["Files", context.files.map((file) => `${file.label}${file.status ? ` (${file.status})` : ""}`).join(", ")]);
  return rows;
}

/** Help inbox (Pen frame 103 · JAuft: inbox JGHtd, states reoIE, mobile AwFu3). */
export default async function HelpInboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CUSTOMER_SUPPORT")) return <PermissionDenied permission="CUSTOMER_SUPPORT" />;
  const params = await searchParams;
  const status = STATUSES.includes(params.status as never) ? (params.status as (typeof STATUSES)[number]) : "OPEN";
  const query = new URLSearchParams({ status, limit: "25" });
  if (params.cursor) query.set("cursor", params.cursor);
  const [inbox, selected] = await Promise.all([
    serverApi(`/v1/admin/help-requests?${query}`, helpInboxSchema),
    params.request ? serverApi(`/v1/admin/help-requests/${encodeURIComponent(params.request)}`, adminHelpRequestSchema) : null,
  ]);

  if (!inbox.ok) {
    return (
      <ErrorState
        title="We couldn't load the help inbox"
        body="Something went wrong on our side. Try again, or share the request ID with support."
        requestId={inbox.error.requestId}
        action={
          <ButtonLink variant="secondary" href="/admin/help">
            Retry
          </ButtonLink>
        }
      />
    );
  }

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>REQUESTS</p>
        <h1 className={styles.title}>Help inbox</h1>
      </header>
      {params.done === "answered" ? (
        <div role="status">
          <StatusChip tone="success">Reply sent</StatusChip>{" "}
          <span className={styles.hint}>The request is ANSWERED and the customer got an email.</span>
        </div>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.tableCol}>
          <div className={styles.listCard}>
            <nav className={styles.tabs} aria-label="Status">
              {STATUSES.map((item) => (
                <a key={item} className={styles.tab} href={`/admin/help?status=${item}`} aria-current={item === status ? "page" : undefined}>
                  {item} · {inbox.data.counts[item]}
                </a>
              ))}
            </nav>
            {inbox.data.entries.length === 0 ? (
              <EmptyState title={`No ${status.toLowerCase()} requests`} body="Questions sent with “Need help” appear here with the customer's context." />
            ) : (
              inbox.data.entries.map((entry) => (
                <a
                  key={entry.id}
                  className={styles.item}
                  href={`/admin/help?status=${status}&request=${entry.id}`}
                  aria-current={entry.id === params.request ? "true" : undefined}
                >
                  <span className={styles.itemTop}>
                    <span>
                      {entry.requester.name ?? entry.requester.email} · {entry.requester.kind}
                    </span>
                    <span className={styles.itemMeta}>{ago(entry.createdAt)}</span>
                  </span>
                  <span className={styles.itemMeta}>{where(entry.context)}</span>
                  <span>
                    <StatusChip tone={TONE[entry.status]}>{entry.status}</StatusChip>
                  </span>
                </a>
              ))
            )}
          </div>
          {inbox.data.nextCursor ? (
            <a className={styles.pageLink} href={`/admin/help?status=${status}&cursor=${inbox.data.nextCursor}`}>
              Next ›
            </a>
          ) : null}
        </div>

        {selected?.ok ? (
          <section className={styles.tableCol} aria-labelledby="help-title">
            <div className={styles.recordHead}>
              <p className={styles.eyebrow}>
                HELP REQUEST {selected.data.reference} · {selected.data.requester.kind.toUpperCase()}
              </p>
              <h2 id="help-title" className={styles.recordTitle}>
                “{selected.data.message}”
              </h2>
              <p className={styles.chips}>
                <StatusChip tone={TONE[selected.data.status]}>{selected.data.status}</StatusChip>
                {[selected.data.requester.name, selected.data.requester.email, `${ago(selected.data.createdAt)} ago`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <section className={styles.panel} aria-labelledby="context-title">
              <h3 id="context-title" className={styles.panelTitle}>
                Context attached automatically
              </h3>
              <dl className={styles.fields}>
                {contextRows(selected.data.context).map(([term, value]) => (
                  <Fragment key={term}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
                <dt>Customer</dt>
                <dd>{selected.data.requester.kind === "guest" ? "Guest · sees only their own requests" : "Account"}</dd>
              </dl>
            </section>
            {selected.data.replies.length ? (
              <section className={styles.panel} aria-labelledby="replies-title">
                <h3 id="replies-title" className={styles.panelTitle}>
                  Replies
                </h3>
                {selected.data.replies.map((reply) => (
                  <div key={reply.id}>
                    <p className={styles.hint}>
                      {reply.author} · {ago(reply.createdAt)} ago
                    </p>
                    <p className={styles.reply}>{reply.body}</p>
                  </div>
                ))}
              </section>
            ) : null}
            <HelpActions id={selected.data.id} status={selected.data.status} backTo={`/admin/help?status=${status}&request=${selected.data.id}`} />
          </section>
        ) : selected ? (
          <ErrorState title="We couldn't load this request" requestId={selected.error.requestId} />
        ) : (
          <p className={styles.hint}>Choose a request to see its context and reply.</p>
        )}
      </div>
    </>
  );
}
