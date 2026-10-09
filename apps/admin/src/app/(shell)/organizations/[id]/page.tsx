import { adminOrganizationSchema, ROLE_LABELS } from "@holypearls/contracts";
import { ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import { formatTime } from "../../format";

const MEMBER_TONE = { ACTIVE: "success", DEACTIVATED: "neutral" } as const;
const INVITE_TONE = { PENDING: "info", EXPIRED: "warning", REVOKED: "neutral", ACCEPTED: "success" } as const;

const reach = (entry: { allLocations: boolean; locations: { name: string }[] }) => (entry.allLocations ? "All locations" : entry.locations.map((location) => location.name).join(", "));

/**
 * One organization, read only (OPS-FR-081): locations, members and
 * invitations. Brand assets, templates, collections and order requests join
 * this view in T11 and T12. ORGANIZATION_SUPPORT.
 */
export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("ORGANIZATION_SUPPORT")) return <PermissionDenied permission="ORGANIZATION_SUPPORT" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const organization = await serverApi(`/v1/admin/organizations/${id}`, adminOrganizationSchema);
  if (!organization.ok) {
    if (organization.status === 404) notFound();
    return <ErrorState title="We couldn't load this organization" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={organization.error.requestId} />;
  }
  const data = organization.data;
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ORGANIZATION · CREATED {formatTime(data.createdAt)}</p>
        <h1 className={styles.title}>{data.name}</h1>
        <p className={styles.hint}>Read only. To change roles or locations, the organization&apos;s Owner or an Admin uses their workspace.</p>
      </header>

      <section className={styles.panel} aria-labelledby="locations-title">
        <h2 id="locations-title" className={styles.panelTitle}>
          Locations · {data.locations.length}
        </h2>
        <ul className={styles.plainList}>
          {data.locations.map((location) => (
            <li key={location.id} className={styles.hint}>
              <span className={styles.strong}>{location.name}</span> · {location.city} · {location.memberCount} {location.memberCount === 1 ? "member" : "members"}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel} aria-labelledby="members-title">
        <h2 id="members-title" className={styles.panelTitle}>
          Members · {data.members.filter((member) => member.status === "ACTIVE").length} active
        </h2>
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Members</caption>
          <thead>
            <tr>
              <th scope="col">MEMBER</th>
              <th scope="col">ROLE</th>
              <th scope="col">LOCATIONS</th>
              <th scope="col">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((member) => (
              <tr key={member.membershipId}>
                <td>
                  <span className={styles.strong}>{member.name}</span>
                  <br />
                  <span className={styles.hint}>{member.email}</span>
                </td>
                <td>
                  {ROLE_LABELS[member.role]}
                  {member.adjusted ? <span className={styles.hint}> · adjusted</span> : null}
                </td>
                <td>{reach(member)}</td>
                <td>
                  <StatusChip tone={MEMBER_TONE[member.status]}>{member.status}</StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.panel} aria-labelledby="assets-title">
        <h2 id="assets-title" className={styles.panelTitle}>
          Brand assets · {data.assets.length}
        </h2>
        {data.assets.length === 0 ? (
          <p className={styles.hint}>No brand assets yet.</p>
        ) : (
          <ul className={styles.plainList}>
            {data.assets.map((asset) => (
              <li key={asset.id} className={styles.hint}>
                <span className={styles.strong}>{asset.name}</span> · {asset.kind.toLowerCase()} · latest V{asset.latestNumber} {asset.latestStatus.replaceAll("_", " ").toLowerCase()}
                {asset.currentNumber ? ` · current V${asset.currentNumber}` : " · none production ready yet"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="invitations-title">
        <h2 id="invitations-title" className={styles.panelTitle}>
          Invitations
        </h2>
        {data.invitations.length === 0 ? (
          <p className={styles.hint}>No invitations waiting.</p>
        ) : (
          <table className={styles.table}>
            <caption className="hp-visually-hidden">Invitations</caption>
            <thead>
              <tr>
                <th scope="col">EMAIL</th>
                <th scope="col">ROLE</th>
                <th scope="col">LOCATIONS</th>
                <th scope="col">STATUS</th>
                <th scope="col">EXPIRES</th>
              </tr>
            </thead>
            <tbody>
              {data.invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td>{invitation.email}</td>
                  <td>{ROLE_LABELS[invitation.role]}</td>
                  <td>{reach(invitation)}</td>
                  <td>
                    <StatusChip tone={INVITE_TONE[invitation.status]}>{invitation.status}</StatusChip>
                  </td>
                  <td className={styles.mono}>{formatTime(invitation.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
