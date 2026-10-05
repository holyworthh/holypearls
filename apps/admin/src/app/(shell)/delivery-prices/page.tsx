import { deliveryPriceQueueSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { PriceQueue } from "./PriceQueue";

/**
 * Delivery prices (owner, 2026-10-05): checkouts to addresses outside the
 * delivery zones wait here until staff set a price. There's no Pen frame; it
 * follows the admin list archetype (Pen 96). PRICING_MANAGE.
 */
export default async function DeliveryPricesPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PRICING_MANAGE")) return <PermissionDenied permission="PRICING_MANAGE" />;
  const queue = await serverApi("/v1/admin/delivery-prices", deliveryPriceQueueSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>DELIVERY</p>
        <h1 className={styles.title}>Delivery prices</h1>
        <p className={styles.hint}>Customers here have finished checkout for an address outside the delivery zones. They can pay once you set the price (before VAT).</p>
      </header>
      {!queue.ok ? (
        <ErrorState
          title="We couldn't load this list"
          requestId={queue.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/delivery-prices">
              Try again
            </ButtonLink>
          }
        />
      ) : queue.data.items.length === 0 ? (
        <EmptyState title="No one is waiting for a delivery price" body="Checkouts to other states or abroad appear here when the customer finishes the steps." />
      ) : (
        <PriceQueue initial={queue.data.items} />
      )}
    </>
  );
}
