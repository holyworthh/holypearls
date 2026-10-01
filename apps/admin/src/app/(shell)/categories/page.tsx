import { adminCategoryListSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import css from "../products/catalogue.module.css";
import { CategoryEditor } from "./CategoryEditor";

const TONE = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "neutral" } as const;

/** Categories list and editor (Pen frame 104 · eFFQR, states aBkm0). */
export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ id?: string; new?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CATALOGUE_MANAGE" />;
  const params = await searchParams;
  const list = await serverApi("/v1/admin/catalogue/categories", adminCategoryListSchema);
  const entries = list.ok ? list.data.entries : [];
  const selected = params.new ? null : (entries.find((entry) => entry.id === params.id) ?? entries[0] ?? null);
  const creating = Boolean(params.new) || (list.ok && entries.length === 0);

  return (
    <>
      <header className={css.headRow}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>CATALOGUE</p>
          <h1 className={styles.title}>Categories</h1>
        </div>
        <div className={css.headActions}>
          <ButtonLink variant="secondary" href="/products">
            Products
          </ButtonLink>
          <ButtonLink href="/categories?new=1">New category</ButtonLink>
        </div>
      </header>
      {!list.ok ? (
        <ErrorState
          title="We couldn't load this list"
          requestId={list.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/categories">
              Try again
            </ButtonLink>
          }
        />
      ) : (
        <div className={styles.columns}>
          <div className={styles.tableCol}>
            {entries.length === 0 ? (
              <EmptyState title="No categories yet" body="Create a category to group products." />
            ) : (
              <table className={styles.table}>
                <caption className="hp-visually-hidden">Categories, top level first</caption>
                <thead>
                  <tr>
                    <th scope="col">CATEGORY</th>
                    <th scope="col">PARENT</th>
                    <th scope="col">PRODUCTS</th>
                    <th scope="col">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((category) => (
                    <tr key={category.id} className={category.id === selected?.id && !creating ? styles.selected : undefined}>
                      <td>
                        <a className={styles.action} href={`/categories?id=${category.id}`} aria-current={category.id === selected?.id && !creating ? "true" : undefined}>
                          {category.name}
                        </a>
                      </td>
                      <td>{category.parentName ?? "—"}</td>
                      <td>{category.productCount}</td>
                      <td>
                        <StatusChip tone={TONE[category.status]}>{category.status}</StatusChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <aside className={styles.detailCol} aria-label={creating ? "New category" : "Edit category"}>
            <CategoryEditor
              key={creating ? "new" : selected?.id}
              category={creating ? null : selected}
              parents={entries.filter((entry) => !entry.parentId && entry.status !== "ARCHIVED")}
            />
          </aside>
        </div>
      )}
    </>
  );
}
