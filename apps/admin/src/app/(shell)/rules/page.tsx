import { pricingProductListSchema, scheduledChangesSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { formatTime, money } from "../format";
import { BUYING_MODE } from "./labels";

/** Rules & prices (OPS-FR-010–019; Pen 107): every product, its price now, and whether its rules are set. PRICING_MANAGE. */
export default async function RulesPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PRICING_MANAGE")) return <PermissionDenied permission="PRICING_MANAGE" />;
  const [list, scheduled] = await Promise.all([serverApi("/v1/admin/pricing/products", pricingProductListSchema), serverApi("/v1/admin/pricing/scheduled", scheduledChangesSchema)]);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>CATALOGUE</p>
        <h1 className={styles.title}>Rules & prices</h1>
        <p className={styles.hint}>Minimums, lead times, samples and proofs, what works together, prices from a date, and VAT. Accepted quotes and existing orders never change.</p>
      </header>
      {scheduled.ok && scheduled.data.changes.length ? (
        <section className={styles.panel} aria-labelledby="scheduled-title">
          <h2 id="scheduled-title" className={styles.panelTitle}>
            Scheduled changes (OPS-FR-130)
          </h2>
          <p className={styles.hint}>Accepted quotes and orders are unchanged: they keep their saved copies. Drafts are repriced on next open and show &quot;Price updated&quot;; carts show the new price before checkout.</p>
          <ul className={styles.plainList}>
            {scheduled.data.changes.map((change) => (
              <li key={`${change.productId}-${change.effectiveFrom}`}>
                <a className={styles.action} href={`/rules/${change.productId}?tab=prices`}>
                  {change.productName}
                </a>{" "}
                · new prices from {formatTime(change.effectiveFrom)} · {change.drafts} draft{change.drafts === 1 ? "" : "s"} will be repriced on next open · {change.carts} cart item{change.carts === 1 ? "" : "s"} will show a price update
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!list.ok ? (
        <ErrorState
          title="We couldn't load this list"
          requestId={list.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/rules">
              Try again
            </ButtonLink>
          }
        />
      ) : list.data.products.length === 0 ? (
        <EmptyState title="No products yet" body="Products added in the catalogue appear here." />
      ) : (
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Products and their rules</caption>
          <thead>
            <tr>
              <th scope="col">PRODUCT</th>
              <th scope="col">BUYING MODE</th>
              <th scope="col">PRICE NOW</th>
              <th scope="col">RULES</th>
            </tr>
          </thead>
          <tbody>
            {list.data.products.map((product) => (
              <tr key={product.id}>
                <td>
                  <a className={styles.action} href={`/rules/${product.id}`}>
                    {product.name}
                  </a>
                </td>
                <td>{BUYING_MODE[product.buyingMode]}</td>
                <td className={styles.mono}>
                  {product.price ? `From ${money(product.price.baseMinor, product.price.currency)}` : "No price"}
                  {product.scheduled ? <span className={styles.hint}> · new price scheduled</span> : null}
                </td>
                <td>{product.hasRules ? <StatusChip tone="success">SET</StatusChip> : <StatusChip tone="warning">NOT SET</StatusChip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
