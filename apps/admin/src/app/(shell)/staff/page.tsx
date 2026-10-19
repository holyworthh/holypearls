import { staffListSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { StaffList } from "./StaffList";

/** Staff (Pen 122 · rbymz, states vFTNv; PRD-06 §2; TECH-03 §8–11). STAFF_ADMIN only. */
export default async function StaffPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("STAFF_ADMIN")) return <PermissionDenied permission="STAFF_ADMIN" />;
  const list = await serverApi("/v1/admin/staff", staffListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>STAFF PERMISSIONS ARE SEPARATE FROM CUSTOMER ROLES</p>
        <h1 className={styles.title}>Staff</h1>
      </header>
      {!list.ok ? (
        <ErrorState
          title="We couldn't load this list"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={list.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/staff">
              Try again
            </ButtonLink>
          }
        />
      ) : (
        <>
          {list.data.members.length <= 1 && !list.data.invitations.length ? <EmptyState title="No other staff yet" body="Invite at least one more STAFF_ADMIN so nobody gets locked out." /> : null}
          <StaffList initial={list.data} />
        </>
      )}
    </>
  );
}
