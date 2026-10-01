import { adminReviewListSchema, paymentSettingsSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import { PaymentsTabs } from "../PaymentsTabs";
import { SettingsForm } from "./SettingsForm";

/** Payment settings and the Paystack setup checklist (Pen 100 · f2p7r; TECH-05 §13–14). */
export default async function PaymentSettingsPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PAYMENT_VIEW") && !admin.permissions.includes("PAYMENT_MANAGE")) return <PermissionDenied permission="PAYMENT_MANAGE" />;
  const [settings, reviews] = await Promise.all([serverApi("/v1/admin/payments/settings", paymentSettingsSchema), serverApi("/v1/admin/payments/reviews?status=OPEN", adminReviewListSchema)]);

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>PAYMENTS · PAYSTACK ONLY (ADR-011)</p>
        <h1 className={styles.title}>Payment settings</h1>
      </header>
      <PaymentsTabs current="settings" openReviews={reviews.ok ? reviews.data.items.length : null} />
      {settings.ok ? (
        <SettingsForm initial={settings.data} canManage={admin.permissions.includes("PAYMENT_MANAGE")} />
      ) : (
        <ErrorState title="We couldn't load the settings" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={settings.error.requestId} />
      )}
    </>
  );
}
