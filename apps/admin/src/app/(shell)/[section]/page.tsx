import { PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { canSee, findSection } from "../../nav";
import { requireAdmin } from "../admin-session";
import styles from "../admin.module.css";

/**
 * Every admin section checks the staff member's permissions and shows the
 * 403 state inside the shell when one is missing (Pen frame 94 · zsnmb). The
 * API checks again on every request; this only decides what to show.
 */
export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: slug } = await params;
  const section = findSection(slug);
  if (!section) notFound();
  const admin = await requireAdmin();
  if (!canSee(section, admin.permissions)) return <PermissionDenied permission={section.anyOf.join(" or ")} />;
  return (
    <>
      <h1 className={styles.title}>{section.label}</h1>
      <p className={styles.support}>This section is built in ticket {section.ticket}.</p>
    </>
  );
}
