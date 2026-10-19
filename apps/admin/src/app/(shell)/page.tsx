import { opsHomeSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import list from "./admin-list.module.css";
import styles from "./admin.module.css";
import { requireAdmin } from "./admin-session";

const today = (now = new Date()) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(now).toUpperCase();

/**
 * Operations home (PRD-06 §17; Pen 95 · NSHTn): work queues, not charts.
 * Each card opens its filtered list; queues outside the person's permissions
 * aren't shown, and their counts never reach the browser.
 */
export default async function AdminHome() {
  await requireAdmin();
  const home = await serverApi("/v1/admin/home", opsHomeSchema);
  return (
    <>
      <header className={list.head}>
        <p className={list.eyebrow}>{today()}</p>
        <h1 className={styles.title}>Operations home</h1>
      </header>
      {!home.ok ? (
        <ErrorState
          title="We couldn't load your queues"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={home.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/">
              Try again
            </ButtonLink>
          }
        />
      ) : home.data.queues.length === 0 ? (
        <EmptyState title="No work queues for your permissions" body="The sidebar shows the sections you can use." />
      ) : home.data.queues.every((queue) => queue.count === 0) ? (
        <EmptyState title="All queues are clear" body="New work appears here as it arrives." />
      ) : (
        <ul className={styles.queues}>
          {home.data.queues.map((queue) => (
            <li key={queue.key}>
              <a className={styles.queue} href={queue.href}>
                <span className={styles.queueLabel}>{queue.label}</span>
                <span className={styles.queueCount}>{queue.count}</span>
                <span className={styles.queueDetail}>{queue.detail}</span>
                <span className={styles.queueOpen}>
                  Open queue<span aria-hidden="true"> →</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
