import { incidentStateSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { IncidentSwitches } from "./IncidentSwitches";

/** Incident switches (Pen 123 · S1fH7, switches JqxuW, states bCk9j; TECH-06 §14). SECURITY_ADMIN only. */
export default async function IncidentsPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("SECURITY_ADMIN")) return <PermissionDenied permission="SECURITY_ADMIN" />;
  const state = await serverApi("/v1/admin/incidents", incidentStateSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>USE WITH THE RUNBOOKS IN docs/runbooks/</p>
        <h1 className={styles.title}>Incident switches</h1>
      </header>
      {!state.ok ? (
        <ErrorState
          title="We couldn't load this page"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={state.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/incidents">
              Try again
            </ButtonLink>
          }
        />
      ) : (
        <IncidentSwitches initial={state.data} />
      )}
    </>
  );
}
