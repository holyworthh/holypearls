import { adminProjectSchema, adminRequestListSchema, PROJECT_TYPE_INFO } from "@holypearls/contracts";
import { EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { Fragment } from "react";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago, formatTime } from "../format";
import { StartReview } from "./StartReview";

type Search = { id?: string; view?: string };

const STATUS_TONE: Record<string, "info" | "warning" | "success" | "neutral"> = {
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  PENDING_REVIEW: "info",
  REVISION_REQUESTED: "warning",
  QUOTED: "success",
  READY: "success",
};

/**
 * New requests: submitted projects and configuration quote requests, oldest
 * first, with everything the customer sent (Pen 124B · YN3WS: queue zK6SY,
 * mobile R9Dmw, states fomqX; OPS-FR-030). QUOTE_MANAGE.
 */
export default async function ProjectsQueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("QUOTE_MANAGE")) return <PermissionDenied permission="QUOTE_MANAGE" />;
  const params = await searchParams;
  const quoted = params.view === "quoted";
  const queue = await serverApi(`/v1/admin/requests${quoted ? "?view=quoted" : ""}`, adminRequestListSchema);
  const selected = queue.ok ? (queue.data.items.find((item) => item.id === params.id) ?? queue.data.items[0]) : undefined;
  const project = selected?.kind === "PROJECT" ? await serverApi(`/v1/admin/projects/${selected.id}`, adminProjectSchema) : null;

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / REQUESTS / PROJECTS</p>
        <h1 className={styles.title}>New requests</h1>
      </header>
      <nav className={styles.tabs} aria-label="Requests">
        <a className={styles.tab} href="/projects" aria-current={!quoted ? "page" : undefined}>
          Queue{queue.ok && !quoted ? ` · ${queue.data.items.length}` : ""}
        </a>
        <a className={styles.tab} href="/projects?view=quoted" aria-current={quoted ? "page" : undefined}>
          Quoted
        </a>
        <a className={styles.tab} href="/projects/rules">
          Recommendation rules
        </a>
      </nav>

      {!queue.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={queue.error.requestId} />
      ) : (
        <div className={styles.columns}>
          <div className={styles.tableCol}>
            {queue.data.items.length === 0 ? (
              <EmptyState title={quoted ? "Nothing quoted yet" : "No new requests"} body="Projects from Start a Project and Request Final Quote land here." />
            ) : (
              <ul className={styles.listCard} aria-label={quoted ? "Quoted requests" : "New requests, oldest first"}>
                {queue.data.items.map((item) => (
                  <li key={item.id}>
                    <a className={styles.item} href={`/projects?${quoted ? "view=quoted&" : ""}id=${item.id}`} aria-current={item.id === selected?.id ? "true" : undefined}>
                      <span className={styles.itemTop}>
                        <strong>
                          {item.reference} · {item.title}
                        </strong>
                        <StatusChip tone={STATUS_TONE[item.status] ?? "neutral"}>{item.status}</StatusChip>
                      </span>
                      <span className={styles.itemMeta}>
                        {item.kind === "PROJECT" ? "Project" : "Configuration quote"} · {item.customer}
                        {item.guest ? " (guest)" : ""} · {ago(item.submittedAt)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className={styles.detailCol} aria-label="Request detail">
            {selected?.kind === "CONFIGURATION" ? (
              <section className={styles.panel} aria-labelledby="request-title">
                <p className={styles.eyebrow}>CONFIGURATION QUOTE · {selected.reference}</p>
                <h2 id="request-title" className={styles.panelTitle}>
                  {selected.title}
                </h2>
                <div className={styles.chips}>
                  <StatusChip tone={STATUS_TONE[selected.status] ?? "neutral"}>{selected.status}</StatusChip>
                  <span className={styles.hint}>
                    {selected.customer} · {formatTime(selected.submittedAt)}
                  </span>
                </div>
                <p className={styles.hint}>Every choice and the price shown are kept with the quote request (PROJ-FR-012).</p>
                <div className={styles.panelActions}>
                  <a className={styles.action} href={`/quotes/${selected.quote!.id}`}>
                    Build quote
                  </a>
                </div>
              </section>
            ) : project && !project.ok ? (
              <ErrorState title="We couldn't load this project" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={project.error.requestId} />
            ) : project?.ok ? (
              <section className={styles.panel} aria-labelledby="request-title">
                <p className={styles.eyebrow}>
                  PROJECT {project.data.reference} · {project.data.contact.guest ? "GUEST" : "ACCOUNT"} {project.data.contact.email}
                </p>
                <h2 id="request-title" className={styles.panelTitle}>
                  {project.data.title || PROJECT_TYPE_INFO[project.data.type].label}
                </h2>
                <div className={styles.chips}>
                  <StatusChip tone={STATUS_TONE[project.data.status] ?? "neutral"}>{project.data.status}</StatusChip>
                  <span className={styles.hint}>
                    {project.data.quote ? `Quote ${project.data.quote.status}` : "No quote yet"} · sent {formatTime(project.data.submittedAt)}
                  </span>
                </div>
                <div className={styles.panelActions}>
                  {project.data.status === "SUBMITTED" ? <StartReview projectId={project.data.id} /> : null}
                  {project.data.quote ? (
                    <a className={styles.action} href={`/quotes/${project.data.quote.id}`}>
                      Build quote
                    </a>
                  ) : null}
                </div>

                <h3 className={styles.panelTitle}>Everything the customer sent</h3>
                <dl className={styles.fields}>
                  <dt>Kind</dt>
                  <dd>{PROJECT_TYPE_INFO[project.data.type].label}</dd>
                  <dt>Contact</dt>
                  <dd>
                    {project.data.contact.name ? `${project.data.contact.name}, ` : ""}
                    {project.data.contact.email}
                  </dd>
                  {project.data.brief.map((row) => (
                    <Fragment key={`${row.step}-${row.question}`}>
                      <dt>{row.question}</dt>
                      <dd>{row.answer}</dd>
                    </Fragment>
                  ))}
                </dl>

                <h3 className={styles.panelTitle}>Items ({project.data.items.length})</h3>
                <ul className={styles.plainList}>
                  {project.data.items.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <strong>{item.name}</strong> · {item.quantity === null ? "quantity after review" : `× ${item.quantity.toLocaleString("en-NG")}`} · {item.kind}
                      {item.detail ? <span className={styles.hint}> · {item.detail}</span> : null}
                    </li>
                  ))}
                </ul>

                <h3 className={styles.panelTitle}>Files ({project.data.files.length})</h3>
                {project.data.files.length ? (
                  <ul className={styles.plainList}>
                    {project.data.files.map((file) => (
                      <li key={file.id}>
                        {file.name} · {file.status}
                        {file.item ? <span className={styles.hint}> · for {file.item}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.hint}>No files. The customer can send artwork later.</p>
                )}

                {project.data.openItems.length ? (
                  <>
                    <h3 className={styles.panelTitle}>Still to come</h3>
                    <ul className={styles.plainList}>
                      {project.data.openItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </>
  );
}
