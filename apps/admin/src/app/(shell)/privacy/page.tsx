import { PermissionDenied } from "@holypearls/ui";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { Privacy } from "./Privacy";

/** Privacy requests (Pen 136 · O7Qcg, states jUCsW; TECH-06 §12): look a person up, export their data, erase and anonymize it. */
export default async function PrivacyPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("EXPORT_PERSONAL_DATA")) return <PermissionDenied permission="EXPORT_PERSONAL_DATA" />;
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>LOGGED IN THE AUDIT LOG</p>
        <h1 className={styles.title}>Privacy requests</h1>
      </header>
      <Privacy />
    </>
  );
}
