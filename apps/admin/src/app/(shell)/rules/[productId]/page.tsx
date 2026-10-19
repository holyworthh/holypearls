import { adminPriceRuleListSchema, adminProductRulesSchema, adminTaxSettingListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import { BUYING_MODE } from "../labels";
import { PriceVersions } from "./PriceVersions";
import { ProductRulesForm } from "./ProductRulesForm";
import { VatPanel } from "./VatPanel";
import css from "../../form-layout.module.css";

const TABS = [
  ["product", "Product rules"],
  ["prices", "Price rules"],
  ["states", "Price-state rules"],
  ["vat", "VAT"],
] as const;
type Tab = (typeof TABS)[number][0];

/** One product's rules, prices, price states and VAT (Pen 107 · GUSNm). PRICING_MANAGE. */
export default async function ProductRulesPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PRICING_MANAGE")) return <PermissionDenied permission="PRICING_MANAGE" />;
  const { productId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(productId)) notFound();
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.find(([key]) => key === requested)?.[0] ?? "product";
  const base = `/v1/admin/pricing/products/${productId}`;
  const [rules, prices, vat] = await Promise.all([serverApi(`${base}/rules`, adminProductRulesSchema), serverApi(`${base}/prices`, adminPriceRuleListSchema), serverApi("/v1/admin/pricing/vat", adminTaxSettingListSchema)]);
  if (!rules.ok && rules.status === 404) notFound();
  if (!rules.ok || !prices.ok || !vat.ok) {
    const failed = !rules.ok ? rules : !prices.ok ? prices : vat;
    return (
      <ErrorState
        title="We couldn't load these rules"
        requestId={failed.ok ? undefined : failed.error.requestId}
        action={
          <ButtonLink variant="secondary" href={`/rules/${productId}?tab=${tab}`}>
            Try again
          </ButtonLink>
        }
      />
    );
  }
  const { product } = rules.data;
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>
          <a href="/rules">RULES & PRICES</a> · {product.slug}
        </p>
        <h1 className={styles.title}>{product.name}</h1>
        <p className={styles.hint}>
          {BUYING_MODE[product.buyingMode]} · {product.status.replaceAll("_", " ").toLowerCase()} {rules.data.rules ? null : <StatusChip tone="warning">RULES NOT SET</StatusChip>}
        </p>
      </header>
      <nav className={styles.tabs} aria-label="Rules">
        {TABS.map(([key, label]) => (
          <a key={key} className={styles.tab} href={`/rules/${productId}?tab=${key}`} aria-current={key === tab ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {tab === "product" ? <ProductRulesForm productId={productId} initial={rules.data} /> : null}
      {tab === "prices" ? <PriceVersions productId={productId} initial={prices.data.entries} options={rules.data.options} /> : null}
      {tab === "states" ? (
        <section className={styles.panel} aria-labelledby="states-title">
          <h2 id="states-title" className={styles.panelTitle}>
            How the price state is decided (OPS-FR-015)
          </h2>
          <p className={styles.hint}>The calculator uses the most restrictive state that applies, top first. Changing state never discards the customer&apos;s choices (PRD-00 §7).</p>
          <ol className={css.steps}>
            <li>
              <strong>CONSULTATION_REQUIRED</strong> · the product is a project with our team ({BUYING_MODE.CONSULTATIVE_PROJECT}).
            </li>
            <li>
              <strong>QUOTE_REQUIRED</strong> · the product rules aren&apos;t set, there&apos;s no price in force, the quantity is below the minimum with manual review or above the
              automatic limit{rules.data.rules?.maxAutoQuantity ? ` (${rules.data.rules.maxAutoQuantity.toLocaleString("en-NG")})` : ""}, rush needs review, or a choice needs review under Compatibility.
            </li>
            <li>
              <strong>ESTIMATE_READY</strong> · the product is configured, then quoted ({BUYING_MODE.CONFIGURABLE_QUOTE}), or the price in force is marked as an estimate.
            </li>
            <li>
              <strong>PRICE_READY</strong> · everything else: the price in force is exact.
            </li>
          </ol>
        </section>
      ) : null}
      {tab === "vat" ? <VatPanel initial={vat.data.entries} /> : null}
    </>
  );
}
