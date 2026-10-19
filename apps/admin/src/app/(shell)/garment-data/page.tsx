import { garmentDataSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, Notice, PermissionDenied } from "@holypearls/ui";
import { DECORATION_LABELS, ROUTE_LABELS } from "@holypearls/web-kit/catalogue-labels";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { FabricManager } from "./FabricManager";
import { PlacementMatrix } from "./PlacementMatrix";

const TABS = [
  ["fabrics", "Fabrics & colours"],
  ["placements", "Decorations & placements"],
  ["sourcing", "Garment sourcing"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Garment and production data (OPS-FR-020–022; Pen 118 · DGylb). CATALOGUE_MANAGE. */
export default async function GarmentDataPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CATALOGUE_MANAGE" />;
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.find(([key]) => key === requested)?.[0] ?? "fabrics";
  const data = await serverApi("/v1/admin/garment-data", garmentDataSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>OPS-FR-020–022</p>
        <h1 className={styles.title}>Garment and production data</h1>
      </header>
      <nav className={styles.tabs} aria-label="Garment data">
        {TABS.map(([key, label]) => (
          <a key={key} className={styles.tab} href={`/garment-data?tab=${key}`} aria-current={key === tab ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {!data.ok ? (
        <ErrorState
          title="We couldn't load the garment data"
          requestId={data.error.requestId}
          action={
            <ButtonLink variant="secondary" href={`/garment-data?tab=${tab}`}>
              Try again
            </ButtonLink>
          }
        />
      ) : tab === "fabrics" ? (
        <>
          <FabricManager initial={data.data.fabrics} />
          <Notice tone="info" title="Internal fields">
            <p>Supplier codes are stored for staff and never appear on customer pages, quotes or exports to customers.</p>
          </Notice>
        </>
      ) : tab === "placements" ? (
        <PlacementMatrix initial={data.data.blocked} />
      ) : (
        <section className={styles.panel} aria-labelledby="sourcing-title">
          <h2 id="sourcing-title" className={styles.panelTitle}>
            How each product is made and decorated (OPS-FR-020)
          </h2>
          <p className={styles.hint}>Set on each product. The configurator offers only these.</p>
          <table className={styles.table}>
            <caption className="hp-visually-hidden">Making routes and decorations per product</caption>
            <thead>
              <tr>
                <th scope="col">PRODUCT</th>
                <th scope="col">HOW IT&apos;S MADE</th>
                <th scope="col">DECORATION</th>
              </tr>
            </thead>
            <tbody>
              {data.data.sourcing.map((product) => (
                <tr key={product.id}>
                  <td>
                    <a className={styles.action} href={`/products/${product.id}`}>
                      {product.name}
                    </a>
                  </td>
                  <td>{product.routes.map((route) => ROUTE_LABELS[route as keyof typeof ROUTE_LABELS] ?? route).join(", ") || "—"}</td>
                  <td>{product.decorations.map((decoration) => DECORATION_LABELS[decoration as keyof typeof DECORATION_LABELS] ?? decoration).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
