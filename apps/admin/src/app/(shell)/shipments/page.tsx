import { shippingQueueSchema } from "@holypearls/contracts";
import { EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";
import { SHIPMENT_TONE } from "./tones";

/** Shipments (Pen 115 · ItlTv; OPS-FR-070–073): orders ready to ship, and shipments on their way. FULFILMENT_MANAGE. */
export default async function ShipmentsPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("FULFILMENT_MANAGE")) return <PermissionDenied permission="FULFILMENT_MANAGE" />;
  const queue = await serverApi("/v1/admin/shipments", shippingQueueSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / ORDERS / SHIPMENTS</p>
        <h1 className={styles.title}>Shipments</h1>
      </header>
      {!queue.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={queue.error.requestId} />
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="ready-title">
            <h2 id="ready-title" className={styles.panelTitle}>
              Ready to ship ({queue.data.ready.length})
            </h2>
            {queue.data.ready.length === 0 ? (
              <EmptyState title="Nothing ready to ship" body="Items appear here when READY_TO_DISPATCH." />
            ) : (
              <table className={styles.table}>
                <caption className="hp-visually-hidden">Orders with items ready to ship, oldest first</caption>
                <thead>
                  <tr>
                    <th scope="col">ORDER</th>
                    <th scope="col">CUSTOMER</th>
                    <th scope="col">READY ITEMS</th>
                    <th scope="col">READY SINCE</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.ready.map((row) => (
                    <tr key={row.orderId}>
                      <td>
                        <a className={styles.action} href={`/shipments/orders/${row.orderId}`}>
                          {row.orderNumber}
                        </a>
                      </td>
                      <td>{row.contactName}</td>
                      <td className={styles.mono}>{row.readyItems}</td>
                      <td className={styles.mono}>{ago(row.since)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className={styles.panel} aria-labelledby="active-title">
            <h2 id="active-title" className={styles.panelTitle}>
              On their way ({queue.data.active.length})
            </h2>
            {queue.data.active.length === 0 ? (
              <p className={styles.hint}>No shipments in progress.</p>
            ) : (
              <table className={styles.table}>
                <caption className="hp-visually-hidden">Shipments not yet delivered, oldest change first</caption>
                <thead>
                  <tr>
                    <th scope="col">SHIPMENT</th>
                    <th scope="col">ITEMS</th>
                    <th scope="col">CARRIER / TRACKING</th>
                    <th scope="col">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.active.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>
                        <a className={styles.action} href={`/shipments/orders/${shipment.orderId}`}>
                          {shipment.number}
                        </a>
                      </td>
                      <td>{shipment.items.map((item) => `${item.name} × ${item.quantity.toLocaleString("en-NG")}`).join(", ")}</td>
                      <td>{[shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" · ") || "—"}</td>
                      <td>
                        <StatusChip tone={SHIPMENT_TONE[shipment.status] ?? "neutral"}>{shipment.status}</StatusChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
