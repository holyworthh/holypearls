import { adminOrganizationListSchema } from "@holypearls/contracts";
import { Button, ButtonLink, EmptyState, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { formatTime } from "../format";

/**
 * Organizations: the staff support view (PRD-06 OPS-FR-080–081). Read only,
 * ORGANIZATION_SUPPORT. There's no Pen frame; it follows the admin list
 * archetype (Pen 96).
 */
export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("ORGANIZATION_SUPPORT")) return <PermissionDenied permission="ORGANIZATION_SUPPORT" />;
  const { q } = await searchParams;
  const list = await serverApi(`/v1/admin/organizations${q ? `?q=${encodeURIComponent(q)}` : ""}`, adminOrganizationListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / CUSTOMERS / ORGANIZATIONS</p>
        <h1 className={styles.title}>Organizations</h1>
        <p className={styles.hint}>A read-only view of each workspace. Staff never sign in as the customer; changes are made by the organization&apos;s own team.</p>
      </header>
      <form className={styles.filters} action="/organizations" role="search" aria-label="Search organizations">
        <label className={styles.search}>
          <span className="hp-visually-hidden">Search</span>
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input name="q" defaultValue={q} placeholder="Organization name" />
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <span className={styles.spacer} />
        {q ? (
          <a className={styles.clear} href="/organizations">
            Clear search
          </a>
        ) : null}
      </form>
      {!list.ok ? (
        <ErrorState title="We couldn't load organizations" requestId={list.error.requestId} action={<ButtonLink variant="secondary" href="/organizations">Try again</ButtonLink>} />
      ) : list.data.organizations.length === 0 ? (
        <EmptyState title={q ? "No organizations match" : "No organizations yet"} body={q ? "Try part of the name." : "Workspaces appear here once a request is approved."} />
      ) : (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Organizations by name</caption>
          <thead>
            <tr>
              <th scope="col">ORGANIZATION</th>
              <th scope="col">LOCATIONS</th>
              <th scope="col">ACTIVE MEMBERS</th>
              <th scope="col">CREATED</th>
            </tr>
          </thead>
          <tbody>
            {list.data.organizations.map((organization) => (
              <tr key={organization.id}>
                <td>
                  <a className={styles.action} href={`/organizations/${organization.id}`}>
                    {organization.name}
                  </a>
                </td>
                <td className={styles.mono}>{organization.locationCount}</td>
                <td className={styles.mono}>{organization.activeMembers}</td>
                <td className={styles.mono}>{formatTime(organization.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
