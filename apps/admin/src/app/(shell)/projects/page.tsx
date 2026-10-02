import { PermissionDenied } from "@holypearls/ui";
import styles from "../admin.module.css";
import { requireAdmin } from "../admin-session";

/**
 * Projects. The queue of submitted projects arrives with T05-03 (Pen 124B);
 * the recommendation rules (T05-01, Pen 110) live here already.
 */
export default async function ProjectsPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("QUOTE_MANAGE") && !admin.permissions.includes("CUSTOMER_SUPPORT")) return <PermissionDenied permission="QUOTE_MANAGE or CUSTOMER_SUPPORT" />;
  return (
    <>
      <h1 className={styles.title}>Projects</h1>
      <p className={styles.support}>The queue of submitted projects is built in ticket T05-03.</p>
      {admin.permissions.includes("QUOTE_MANAGE") ? (
        <p className={styles.support}>
          <a href="/projects/rules">Recommendation rules</a>: what the Start a Project builder suggests for each kind of project.
        </p>
      ) : null}
    </>
  );
}
