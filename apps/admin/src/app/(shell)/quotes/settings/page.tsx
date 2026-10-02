import { quoteSettingsSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import { QuoteSettingsForm } from "./QuoteSettingsForm";

/** Quote defaults: validity, the expiring reminder, the default payment schedule and terms (QUOTE-FR-006, TECH-05 §4, OPS-FR-040). */
export default async function QuoteSettingsPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("QUOTE_MANAGE")) return <PermissionDenied permission="QUOTE_MANAGE" />;
  const settings = await serverApi("/v1/admin/quote-settings", quoteSettingsSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>QUOTES · DEFAULTS FOR NEW VERSIONS</p>
        <h1 className={styles.title}>Quote settings</h1>
      </header>
      {settings.ok ? (
        <QuoteSettingsForm initial={settings.data} />
      ) : (
        <ErrorState title="We couldn't load the settings" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={settings.error.requestId} />
      )}
    </>
  );
}
