import type { WorkspaceOrder, WorkspaceProject } from "@holypearls/contracts";
import { StatusChip } from "@holypearls/ui";
import { ORDER_SUMMARY, PAYMENT_STATUS } from "../orders/status";
import styles from "./workspace.module.css";

const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** Order rows (Pen 63 · Jn2wL; cards at 390 px): number, items, location, status, next step. */
export function OrderRows({ orders, empty }: { orders: readonly WorkspaceOrder[]; empty: string }) {
  if (!orders.length) return <p className={styles.emptyRow}>{empty}</p>;
  return (
    <ul className={styles.rows}>
      {orders.map((order) => {
        const status = ORDER_SUMMARY[order.summaryStatus];
        const payment = order.paymentStatus ? PAYMENT_STATUS[order.paymentStatus] : null;
        return (
          <li key={order.id} className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.ref}>
                {order.number}
                {order.locationName ? ` · ${order.locationName.toUpperCase()}` : ""} · {shortDay(order.placedAt).toUpperCase()}
              </span>
              <span className={styles.rowTitle}>{order.title}</span>
              <span className={styles.rowMeta}>{order.nextStep}</span>
            </div>
            <span className={styles.rowChips}>
              {order.needsYou ? <StatusChip tone="action">NEEDS YOU</StatusChip> : null}
              <StatusChip tone={status.tone}>{status.label}</StatusChip>
              {payment ? <StatusChip tone={payment.tone}>{payment.label}</StatusChip> : null}
            </span>
            <a className={styles.rowLink} href={`/orders/${order.id}`} aria-label={`Open order ${order.number}`}>
              Open
            </a>
          </li>
        );
      })}
    </ul>
  );
}

const GROUP_LABEL = { DRAFT: "DRAFT", QUOTE_PENDING: "QUOTE PENDING", QUOTE_READY: "QUOTE READY", ACTIVE_ORDER: "ACTIVE ORDER", COMPLETE: "COMPLETE" } as const;
const GROUP_TONE = { DRAFT: "neutral", QUOTE_PENDING: "info", QUOTE_READY: "action", ACTIVE_ORDER: "info", COMPLETE: "success" } as const;
const GROUP_ACTION = { DRAFT: "Continue", QUOTE_PENDING: "View brief", QUOTE_READY: "Review quote", ACTIVE_ORDER: "Open", COMPLETE: "View" } as const;

/** Project rows (Pen 64 · cNcKd). Another member's project can be seen but opened only by the person who placed it. */
export function ProjectRows({ projects, empty }: { projects: readonly WorkspaceProject[]; empty: string }) {
  if (!projects.length) return <p className={styles.emptyRow}>{empty}</p>;
  return (
    <ul className={styles.rows}>
      {projects.map((project) => (
        <li key={project.id} className={styles.row}>
          <div className={styles.rowText}>
            <span className={styles.ref}>
              {project.reference ?? "DRAFT"}
              {project.locationName ? ` · ${project.locationName.toUpperCase()}` : ""}
            </span>
            <span className={styles.rowTitle}>{project.title}</span>
            <span className={styles.rowMeta}>{project.detail}</span>
          </div>
          <span className={styles.rowChips}>
            <StatusChip tone={GROUP_TONE[project.group]}>{GROUP_LABEL[project.group]}</StatusChip>
          </span>
          {project.href ? (
            <a className={styles.rowLink} href={project.href}>
              {GROUP_ACTION[project.group]}
            </a>
          ) : (
            <span className={styles.rowMeta}>Placed by a colleague</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export const PROJECT_GROUPS = ["QUOTE_READY", "DRAFT", "QUOTE_PENDING", "ACTIVE_ORDER", "COMPLETE"] as const;
export { GROUP_LABEL };
