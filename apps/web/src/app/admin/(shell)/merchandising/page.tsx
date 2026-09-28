import { adminMerchandisingListsSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied } from "@holypearls/ui";
import { serverApi } from "../../../../lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { ListEditor } from "./ListEditor";

/**
 * Admin-managed lists (PUB-FR-004): the mega-menu's popular products and the
 * homepage's "Most ordered". There's no Pen frame; it follows the admin list
 * archetype (Pen 96) and the related-products editor.
 */
export default async function MerchandisingPage() {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("CATALOGUE_MANAGE")) return <PermissionDenied permission="CATALOGUE_MANAGE" />;
  const lists = await serverApi("/v1/admin/catalogue/lists", adminMerchandisingListsSchema);
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>CATALOGUE</p>
        <h1 className={styles.title}>Menus & homepage</h1>
      </header>
      {!lists.ok ? (
        <ErrorState
          title="We couldn't load these lists"
          requestId={lists.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/admin/merchandising">
              Try again
            </ButtonLink>
          }
        />
      ) : (
        <div className={styles.columns}>
          {lists.data.lists.map((list) => (
            <div key={list.key} className={styles.tableCol}>
              <ListEditor initial={list} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
