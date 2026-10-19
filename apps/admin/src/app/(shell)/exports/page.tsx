import { EXPORT_PERMISSIONS, EXPORT_TYPES, exportListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { Exports } from "./Exports";

/** Exports (Pen 120 · z19cb6, states v7KOKv; PRD-06 §19; TECH-07 §16). Built in the background, kept 24 hours, logged. */
export default async function ExportsPage() {
  const admin = await requireAdmin();
  if (!EXPORT_TYPES.some((type) => EXPORT_PERMISSIONS[type].some((permission) => admin.permissions.includes(permission)))) return <PermissionDenied permission="EXPORT_PERSONAL_DATA" />;
  const list = await serverApi("/v1/admin/exports", exportListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>LOGGED IN THE AUDIT LOG</p>
        <h1 className={styles.title}>Exports</h1>
      </header>
      {list.ok ? (
        <Exports initial={list.data} />
      ) : (
        <ErrorState
          title="We couldn't load this list"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={list.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/exports">
              Try again
            </ButtonLink>
          }
        />
      )}
    </>
  );
}
