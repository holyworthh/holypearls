import { adminProductPageSchema } from "@holypearls/contracts";
import { Button, ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "../../../../lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ago } from "../format";
import { FAMILY_LABELS, MODE_LABELS, STATUS_TONE } from "./labels";

type Search = { q?: string; status?: string; family?: string; cursor?: string };
const STATUSES = ["", "DRAFT", "PUBLISHED", "TEMPORARILY_UNAVAILABLE", "ARCHIVED"];

/** Products list (Pen frame 96 · XQetq). */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CATALOGUE_MANAGE" />;
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25" });
  for (const key of ["q", "status", "family", "cursor"] as const) if (params[key]) query.set(key, params[key]!);
  const page = await serverApi(`/v1/admin/catalogue/products?${query}`, adminProductPageSchema);
  const filtered = Boolean(params.q || params.status || params.family);

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>CATALOGUE</p>
        <h1 className={styles.title}>Products</h1>
      </header>
      <form className={styles.filters} action="/admin/products" role="search" aria-label="Filter products">
        <label className={styles.search}>
          <span className="hp-visually-hidden">Search</span>
          <input name="q" defaultValue={params.q} placeholder="Search by name, SKU or slug" />
        </label>
        <label className={styles.select}>
          <span className="hp-visually-hidden">Status</span>
          <select name="status" defaultValue={params.status ?? ""}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                Status: {status ? status.replaceAll("_", " ") : "All"}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.select}>
          <span className="hp-visually-hidden">Family</span>
          <select name="family" defaultValue={params.family ?? ""}>
            <option value="">Family: All</option>
            {Object.entries(FAMILY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                Family: {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <span className={styles.spacer} />
        {filtered ? (
          <a className={styles.clear} href="/admin/products">
            Clear filters
          </a>
        ) : null}
      </form>
      {!page.ok ? (
        <ErrorState title="We couldn't load products" requestId={page.error.requestId} action={<ButtonLink variant="secondary" href="/admin/products">Retry</ButtonLink>} />
      ) : page.data.entries.length === 0 ? (
        <EmptyState title={filtered ? "No products match these filters" : "No products yet"} />
      ) : (
        <div className={styles.tableCol}>
          <table className={styles.table}>
            <caption className="hp-visually-hidden">Products, most recently updated first</caption>
            <thead>
              <tr>
                <th scope="col">PRODUCT</th>
                <th scope="col">FAMILY / CATEGORY</th>
                <th scope="col">BUYING MODE</th>
                <th scope="col">STATUS</th>
                <th scope="col">UPDATED</th>
              </tr>
            </thead>
            <tbody>
              {page.data.entries.map((product) => (
                <tr key={product.id}>
                  <td>
                    <a className={styles.action} href={`/admin/products/${product.id}`}>
                      {product.name}
                    </a>
                  </td>
                  <td>
                    {FAMILY_LABELS[product.family]} / {product.categoryName}
                  </td>
                  <td>{MODE_LABELS[product.buyingMode]}</td>
                  <td>
                    <StatusChip tone={STATUS_TONE[product.status]}>{product.status}</StatusChip>
                  </td>
                  <td>{ago(product.updatedAt)} ago</td>
                </tr>
              ))}
            </tbody>
          </table>
          {page.data.nextCursor ? (
            <a className={styles.pageLink} href={`/admin/products?${new URLSearchParams({ ...params, cursor: page.data.nextCursor } as Record<string, string>)}`}>
              Next ›
            </a>
          ) : null}
        </div>
      )}
    </>
  );
}
