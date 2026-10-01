import { adminCategoryListSchema } from "@holypearls/contracts";
import { PermissionDenied } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import { NewProductForm } from "./NewProductForm";

/** Start a DRAFT product; the editor (Pen frame 98) takes over after. */
export default async function NewProductPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CATALOGUE_MANAGE" />;
  const categories = await serverApi("/v1/admin/catalogue/categories", adminCategoryListSchema);
  return (
    <>
      <header className={styles.recordHead}>
        <p className={styles.eyebrow}>
          <a href="/products">CATALOGUE › PRODUCTS</a> › NEW
        </p>
        <h1 className={styles.recordTitle}>New product</h1>
      </header>
      <NewProductForm categories={categories.ok ? categories.data.entries.filter((category) => category.status !== "ARCHIVED") : []} />
    </>
  );
}
