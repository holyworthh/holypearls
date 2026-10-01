import { deliveryZoneListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "../../../../lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ZoneManager } from "./ZoneManager";

/** Delivery zones and rates (Pen 108 · MCTSk; OPS-FR-100–101). Installation rules follow in T13-01. */
export default async function DeliveryPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PRICING_MANAGE")) return <PermissionDenied permission="PRICING_MANAGE" />;
  const zones = await serverApi("/v1/admin/delivery-zones", deliveryZoneListSchema);
  return (
    <>
      {zones.ok ? (
        <ZoneManager initial={zones.data.zones} />
      ) : (
        <>
          <header className={styles.head}>
            <p className={styles.eyebrow}>DELIVERY</p>
            <h1 className={styles.title}>Delivery zones and rates</h1>
          </header>
          <ErrorState
          title="We couldn't load this list"
          requestId={zones.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/admin/delivery">
              Try again
            </ButtonLink>
          }
          />
        </>
      )}
    </>
  );
}
