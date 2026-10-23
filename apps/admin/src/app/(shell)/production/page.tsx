import { productionBoardSchema } from "@holypearls/contracts";
import { EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import list from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";
import styles from "./production.module.css";
import { GROUP_LABEL, ITEM_TONE } from "./tones";

/**
 * Production board (Pen 113 · board mXxtP; OPS-FR-060). Items grouped by
 * waiting, queued, in production, quality check, ready and on hold. Cards open
 * the item panel; there is no drag-to-change, so illegal moves can't be made
 * by accident. PRODUCTION_MANAGE.
 */
export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ view?: string; group?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PRODUCTION_MANAGE")) return <PermissionDenied permission="PRODUCTION_MANAGE" />;
  const params = await searchParams;
  // A list filtered to some groups, as the operations home opens it (T13-03): ?view=list&group=WAITING,ON_HOLD.
  const only = params.group ? new Set(params.group.split(",")) : null;
  const asList = params.view === "list" || only !== null;
  const board = await serverApi("/v1/admin/production", productionBoardSchema);
  const total = board.ok ? board.data.groups.reduce((sum, group) => sum + group.items.length, 0) : 0;
  return (
    <>
      <header className={styles.head}>
        <div className={list.head}>
          <p className={list.eyebrow}>GROUPED PER OPS-FR-060</p>
          <h1 className={list.title}>Production board</h1>
        </div>
        <a className={styles.viewLink} href={asList ? "/production" : "/production?view=list"}>
          {asList ? "Board view" : "List view"}
        </a>
        {only ? (
          <p className={list.hint}>
            Showing {[...only].map((group) => GROUP_LABEL[group as keyof typeof GROUP_LABEL] ?? group).join(" and ")} · <a href="/production?view=list">Show all groups</a>
          </p>
        ) : null}
      </header>
      {!board.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={board.error.requestId} />
      ) : total === 0 ? (
        <EmptyState title="Nothing in production" body="Items appear here once an order is placed." />
      ) : asList ? (
        <table className={list.table}>
          <caption className="hp-visually-hidden">Items in production, by group</caption>
          <thead>
            <tr>
              <th scope="col">ORDER / ITEM</th>
              <th scope="col">PRODUCT</th>
              <th scope="col">GROUP</th>
              <th scope="col">STATUS</th>
              <th scope="col">NOTE</th>
              <th scope="col">CHANGED</th>
            </tr>
          </thead>
          <tbody>
            {board.data.groups
              .filter((group) => !only || only.has(group.group))
              .flatMap((group) =>
              group.items.map((card) => (
                <tr key={card.id}>
                  <td>
                    <a className={list.action} href={`/production/items/${card.id}`}>
                      {card.orderNumber} · {card.position}
                    </a>
                  </td>
                  <td>
                    {card.productName} × {card.quantity.toLocaleString("en-NG")}
                  </td>
                  <td>{GROUP_LABEL[group.group]}</td>
                  <td>
                    <StatusChip tone={ITEM_TONE[card.group === "ON_HOLD" ? "ON_HOLD" : card.status] ?? "neutral"}>{card.group === "ON_HOLD" ? "ON_HOLD" : card.status}</StatusChip>
                  </td>
                  <td>{card.note ?? "—"}</td>
                  <td className={list.mono}>{ago(card.updatedAt)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      ) : (
        <div className={styles.board} role="region" aria-label="Production board" tabIndex={0}>
          {board.data.groups.map((group) => (
            <section key={group.group} className={styles.column} aria-labelledby={`col-${group.group}`}>
              <h2 id={`col-${group.group}`} className={styles.colHead}>
                <span>{GROUP_LABEL[group.group]}</span>
                <span className={styles.colCount}>{group.items.length}</span>
              </h2>
              {group.items.map((card) => (
                <a key={card.id} className={styles.card} href={`/production/items/${card.id}`}>
                  <span className={styles.ref}>
                    {card.orderNumber} · {card.position}
                  </span>
                  <span className={styles.product}>
                    {card.productName} × {card.quantity.toLocaleString("en-NG")}
                  </span>
                  {card.note ? <span className={styles.note}>{card.note}</span> : null}
                  <StatusChip tone={ITEM_TONE[card.group === "ON_HOLD" ? "ON_HOLD" : card.status] ?? "neutral"}>{card.group === "ON_HOLD" ? "ON_HOLD" : card.status}</StatusChip>
                </a>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
