import { adminContentListSchema, contentHref, type ContentType, contentTypeSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { formatTime } from "../format";
import css from "../products/catalogue.module.css";
import c from "./content-admin.module.css";
import { NewContentButton } from "./NewContentButton";

const TONE = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "neutral" } as const;
const TABS: { type: ContentType; label: string; empty: string; body: string; action?: string }[] = [
  { type: "GUIDE", label: "Guides", empty: "No guides yet", body: "Write the first guide.", action: "New guide" },
  { type: "PROJECT", label: "Project pages", empty: "No project pages yet", body: "Add a project page for a kind of order, like staff uniforms.", action: "New project page" },
  { type: "CASE_STUDY", label: "Case studies", empty: "No case studies yet", body: "Add real work, with the client's approval.", action: "New case study" },
  { type: "ABOUT", label: "About", empty: "No About page yet", body: "The About page is created with the site." },
];

/** Content pages by type (Pen 106 · X3mMi list; states pJPKT). */
export default async function ContentPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CONTENT_MANAGE")) return <PermissionDenied permission="CONTENT_MANAGE" />;
  const params = await searchParams;
  const type = contentTypeSchema.safeParse(params.type).data ?? "GUIDE";
  const tab = TABS.find((entry) => entry.type === type)!;
  const list = await serverApi(`/v1/admin/content?type=${type}`, adminContentListSchema);
  const entries = list.ok ? list.data.entries : [];

  return (
    <>
      <header className={css.headRow}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>CATALOGUE</p>
          <h1 className={styles.title}>Content</h1>
        </div>
        <div className={css.headActions}>
          <ButtonLink variant="secondary" href="/content/search-phrases">
            Search phrases
          </ButtonLink>
          {tab.action && tab.type !== "ABOUT" ? <NewContentButton type={tab.type} label={tab.action} /> : null}
        </div>
      </header>
      <nav aria-label="Page types">
        <ul className={c.tabs}>
          {TABS.map((entry) => (
            <li key={entry.type}>
              <a className={c.tab} href={`/content?type=${entry.type}`} aria-current={entry.type === type ? "page" : undefined}>
                {entry.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {!list.ok ? (
        <ErrorState
          title="We couldn't load this list"
          requestId={list.error.requestId}
          action={
            <ButtonLink variant="secondary" href={`/content?type=${type}`}>
              Try again
            </ButtonLink>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState title={tab.empty} body={tab.body} />
      ) : (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">{tab.label}, most recently changed first</caption>
          <thead>
            <tr>
              <th scope="col">TITLE</th>
              <th scope="col">ADDRESS</th>
              <th scope="col">STATUS</th>
              <th scope="col">CHANGED</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <a className={styles.action} href={`/content/${entry.id}`}>
                    {entry.title}
                  </a>
                </td>
                <td className={styles.mono}>{contentHref(entry.type, entry.slug)}</td>
                <td>
                  <span className={c.chips}>
                    <StatusChip tone={TONE[entry.status]}>{entry.status}</StatusChip>
                    {entry.demo ? <StatusChip tone="warning">DEMO</StatusChip> : null}
                    {entry.unpublishedChanges && entry.status === "PUBLISHED" ? <StatusChip tone="info">CHANGES</StatusChip> : null}
                  </span>
                </td>
                <td className={styles.mono}>
                  {formatTime(entry.updatedAt)}
                  {entry.updatedBy ? ` · ${entry.updatedBy}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
