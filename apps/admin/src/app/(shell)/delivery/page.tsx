import { courierSettingsSchema, deliveryZoneListSchema, installationSetupSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { CourierSettingsPanel } from "./CourierSettingsPanel";
import { FreightGroups } from "./FreightGroups";
import { InstallationPanel } from "./InstallationPanel";
import { ZoneManager } from "./ZoneManager";

/** Delivery zones and rates (Pen 108 · MCTSk; OPS-FR-100–101), installation and freight rules (Pen 119 · UOy8G; OPS-FR-101–102). */
export default async function DeliveryPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PRICING_MANAGE")) return <PermissionDenied permission="PRICING_MANAGE" />;
  const zones = await serverApi("/v1/admin/delivery-zones", deliveryZoneListSchema);
  const courier = await serverApi("/v1/admin/courier-settings", courierSettingsSchema);
  const installation = await serverApi("/v1/admin/installation", installationSetupSchema);
  return (
    <>
      {zones.ok ? (
        <>
          <ZoneManager initial={zones.data.zones.filter((zone) => zone.kind !== "COUNTRIES")} />
          {courier.ok ? <CourierSettingsPanel initial={courier.data} /> : null}
          <header className={styles.head}>
            <p className={styles.eyebrow}>TEST DATA · CONFIRM REAL VALUES BEFORE LAUNCH</p>
            <h2 className={styles.title}>Installation and freight rules</h2>
          </header>
          {installation.ok ? <InstallationPanel initial={installation.data} /> : null}
          <FreightGroups initial={zones.data.zones.filter((zone) => zone.kind === "COUNTRIES")} />
        </>
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
            <ButtonLink variant="secondary" href="/delivery">
              Try again
            </ButtonLink>
          }
          />
        </>
      )}
    </>
  );
}
