import { adminOrganizationRequestListSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";

const REQUEST_TONE = { PENDING: "warning", APPROVED: "success", DECLINED: "neutral" } as const;
const VIEWS = [
  ["PENDING", "Waiting"],
  ["APPROVED", "Approved"],
  ["DECLINED", "Declined"],
] as const;

/**
 * Workspace requests (owner decision 2026-10-08): customers ask for a
 * workspace from their account; staff with ORGANIZATION_APPROVE approve or
 * decline. No Pen frame; it follows the admin list archetype (Pen 96).
 */
export default async function OrganizationRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("ORGANIZATION_APPROVE")) return <PermissionDenied permission="ORGANIZATION_APPROVE" />;
  const requested = (await searchParams).status;
  const status = VIEWS.some(([value]) => value === requested) ? requested! : "PENDING";
  const list = await serverApi(`/v1/admin/organization-requests?status=${status}`, adminOrganizationRequestListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / CUSTOMERS / WORKSPACE REQUESTS</p>
        <h1 className={styles.title}>Workspace requests</h1>
        <p className={styles.hint}>Approving creates the organization and its locations, and makes the requester its Owner. Declining needs a reason, which the customer sees.</p>
      </header>
      <nav className={styles.tabs} aria-label="Workspace requests">
        {VIEWS.map(([value, label]) => (
          <a key={value} className={styles.tab} href={`/organization-requests?status=${value}`} aria-current={status === value ? "page" : undefined}>
            {label}
            {list.ok && status === value ? ` · ${list.data.requests.length}` : ""}
          </a>
        ))}
      </nav>
      {!list.ok ? (
        <ErrorState title="We couldn't load requests" requestId={list.error.requestId} action={<ButtonLink variant="secondary" href="/organization-requests">Try again</ButtonLink>} />
      ) : list.data.requests.length === 0 ? (
        <EmptyState title={status === "PENDING" ? "No requests waiting" : "Nothing here yet"} body="Customers ask for a workspace from their account." />
      ) : (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Workspace requests, newest first</caption>
          <thead>
            <tr>
              <th scope="col">COMPANY</th>
              <th scope="col">REQUESTED BY</th>
              <th scope="col">LOCATIONS</th>
              <th scope="col">TEAM</th>
              <th scope="col">STATUS</th>
              <th scope="col">RECEIVED</th>
            </tr>
          </thead>
          <tbody>
            {list.data.requests.map((row) => (
              <tr key={row.id}>
                <td>
                  <a className={styles.action} href={`/organization-requests/${row.id}`}>
                    {row.companyName}
                  </a>
                </td>
                <td>
                  {row.requester.name}
                  <br />
                  <span className={styles.hint}>{row.requester.email}</span>
                </td>
                <td>{row.locations.map((location) => location.name).join(", ")}</td>
                <td className={styles.mono}>{row.teamSize}</td>
                <td>
                  <StatusChip tone={REQUEST_TONE[row.status]}>{row.status}</StatusChip>
                </td>
                <td className={styles.mono}>{ago(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
