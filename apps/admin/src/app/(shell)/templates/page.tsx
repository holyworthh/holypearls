import { adminTemplateListSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";
import { TEMPLATE_TONE } from "./tones";

const VIEWS = [
  ["AWAITING_APPROVAL", "Awaiting approval"],
  ["NEEDS_REVIEW", "Blocked"],
  ["APPROVED", "Approved"],
] as const;

/**
 * Template approval queue (Pen 117 · cpQIJ; OPS-FR-082): templates the
 * organization sent for HolyPearls' check. Frame 117 leaves the permission to
 * be decided; until then STAFF_ADMIN, like brand asset review.
 */
export default async function TemplateQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("STAFF_ADMIN")) return <PermissionDenied permission="STAFF_ADMIN" />;
  const raw = (await searchParams).status;
  const status = VIEWS.find(([value]) => value === raw)?.[0] ?? "AWAITING_APPROVAL";
  const list = await serverApi(`/v1/admin/templates?status=${status}`, adminTemplateListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / CUSTOMERS / TEMPLATES</p>
        <h1 className={styles.title}>Template approval</h1>
        <p className={styles.hint}>Check that each template is producible with its locked fields and production-ready assets. Approved templates can be ordered by the organization&apos;s allowed locations.</p>
      </header>
      <nav className={styles.tabs} aria-label="Template approval">
        {VIEWS.map(([value, label]) => (
          <a key={value} className={styles.tab} href={`/templates?status=${value}`} aria-current={status === value ? "page" : undefined}>
            {label}
            {list.ok && status === value ? ` · ${list.data.templates.length}` : ""}
          </a>
        ))}
      </nav>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} action={<ButtonLink variant="secondary" href="/templates">Try again</ButtonLink>} />
      ) : list.data.templates.length === 0 ? (
        <EmptyState title="Nothing here" body={status === "AWAITING_APPROVAL" ? "Templates appear when an organization sends one for HolyPearls' check." : "No templates in this state."} />
      ) : (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Templates, oldest change first</caption>
          <thead>
            <tr>
              <th scope="col">TEMPLATE</th>
              <th scope="col">ORGANIZATION</th>
              <th scope="col">STATUS</th>
              <th scope="col">CHANGED</th>
            </tr>
          </thead>
          <tbody>
            {list.data.templates.map((row) => (
              <tr key={row.id}>
                <td>
                  <a className={styles.action} href={`/templates/${row.id}`}>
                    {row.name}
                  </a>
                  <br />
                  <span className={styles.hint}>{row.productName}</span>
                </td>
                <td>{row.organizationName}</td>
                <td>
                  <StatusChip tone={TEMPLATE_TONE[row.status]}>{row.status}</StatusChip>
                </td>
                <td className={styles.mono}>{ago(row.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
