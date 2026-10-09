import { adminAssetReviewListSchema, BRAND_ASSET_KIND_LABELS } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";

const TONE = { PROCESSING: "neutral", NEEDS_REVIEW: "warning" } as const;
const VIEWS = [
  ["NEEDS_REVIEW", "Needs review"],
  ["PROCESSING", "File being checked"],
] as const;

/**
 * Brand asset production review (Pen 116 · XLhMz; OPS-FR-083): new versions
 * waiting for a print and embroidery check. Frame 116 leaves the permission
 * to be decided: "until then only STAFF_ADMIN sees it".
 */
export default async function BrandAssetReviewPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("STAFF_ADMIN")) return <PermissionDenied permission="STAFF_ADMIN" />;
  const status = (await searchParams).status === "PROCESSING" ? "PROCESSING" : "NEEDS_REVIEW";
  const list = await serverApi(`/v1/admin/brand-assets/review?status=${status}`, adminAssetReviewListSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>ADMIN / CUSTOMERS / BRAND ASSETS</p>
        <h1 className={styles.title}>Brand assets review</h1>
        <p className={styles.hint}>Check each new version for print and embroidery. Marking it ready makes it the organization&apos;s current version; the previous one is superseded and past orders keep theirs.</p>
      </header>
      <nav className={styles.tabs} aria-label="Brand asset review">
        {VIEWS.map(([value, label]) => (
          <a key={value} className={styles.tab} href={`/brand-assets?status=${value}`} aria-current={status === value ? "page" : undefined}>
            {label}
            {list.ok && status === value ? ` · ${list.data.versions.length}` : ""}
          </a>
        ))}
      </nav>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} action={<ButtonLink variant="secondary" href="/brand-assets">Try again</ButtonLink>} />
      ) : list.data.versions.length === 0 ? (
        <EmptyState title="No asset versions need review" body="New versions appear after processing." />
      ) : (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Asset versions waiting, oldest first</caption>
          <thead>
            <tr>
              <th scope="col">ASSET</th>
              <th scope="col">ORGANIZATION</th>
              <th scope="col">UPLOADED BY</th>
              <th scope="col">STATUS</th>
              <th scope="col">WAITING</th>
            </tr>
          </thead>
          <tbody>
            {list.data.versions.map((row) => (
              <tr key={row.versionId}>
                <td>
                  <a className={styles.action} href={`/brand-assets/${row.assetId}`}>
                    {row.assetName} V{row.number}
                  </a>
                  <br />
                  <span className={styles.hint}>{BRAND_ASSET_KIND_LABELS[row.kind]}</span>
                </td>
                <td>{row.organizationName}</td>
                <td>{row.uploadedBy ?? "—"}</td>
                <td>
                  <StatusChip tone={TONE[row.status as keyof typeof TONE] ?? "neutral"}>{row.status.replaceAll("_", " ")}</StatusChip>
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
