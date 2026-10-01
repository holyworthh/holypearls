import { adminCategoryListSchema, adminProductSchema } from "@holypearls/contracts";
import { PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import { ProductEditor } from "./ProductEditor";

/** Product editor (Pen frame 98). */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CATALOGUE_MANAGE" />;
  const { id } = await params;
  const [product, categories] = await Promise.all([
    serverApi(`/v1/admin/catalogue/products/${encodeURIComponent(id)}`, adminProductSchema),
    serverApi("/v1/admin/catalogue/categories", adminCategoryListSchema),
  ]);
  if (!product.ok) {
    if (product.status === 404 || product.status === 400) notFound();
    throw new Error(product.error.message);
  }
  return (
    <>
      <header className={styles.recordHead}>
        <p className={styles.eyebrow}>
          <a href="/products">CATALOGUE › PRODUCTS</a> › {product.data.sku}
        </p>
        <h1 className={styles.recordTitle}>{product.data.name}</h1>
      </header>
      <ProductEditor initial={product.data} categories={categories.ok ? categories.data.entries : []} />
    </>
  );
}
