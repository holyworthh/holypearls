import { workspaceOrderListSchema, workspaceOrderViewSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { chosenLocation, loadWorkspace } from "../../../../components/workspace/load";
import { OrderRows } from "../../../../components/workspace/WorkspaceLists";
import { workspaceHref, WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const VIEWS = [
  ["attention", "Needs attention"],
  ["active", "Active"],
  ["complete", "Complete"],
  ["all", "All"],
] as const;

/** Orders (Pen 63 · Jn2wL): a filtered view of the normal orders (B2B-FR-011), in the person's locations. */
export default async function WorkspaceOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ view?: string; location?: string; cursor?: string }>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/orders`);
  const location = chosenLocation(organization, query.location);
  const parsed = workspaceOrderViewSchema.safeParse(query.view);
  const view = parsed.success ? parsed.data : "active";
  const list = await serverApi(
    `/v1/organizations/${organizationId}/orders?view=${view}${location ? `&location=${location}` : ""}${query.cursor ? `&cursor=${encodeURIComponent(query.cursor)}` : ""}`,
    workspaceOrderListSchema,
  );
  const href = (key: string) => `/workspace/${organizationId}/orders?view=${key}${location ? `&location=${location}` : ""}`;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="orders" location={location}>
      <div className={styles.head}>
        <h1 className={styles.title}>Orders</h1>
        <ButtonLink href="/products">New order</ButtonLink>
      </div>
      {!list.ok ? (
        <ErrorState
          title="We couldn't load this list"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={list.error.requestId}
          action={
            <ButtonLink variant="secondary" href={href(view)}>
              Try again
            </ButtonLink>
          }
        />
      ) : (
        <>
          <nav className={styles.filters} aria-label="Order filters">
            {VIEWS.map(([key, label]) => (
              <a key={key} className={styles.filter} href={href(key)} aria-current={view === key ? "page" : undefined}>
                {label} · {list.data.counts[key]}
              </a>
            ))}
          </nav>
          <section className={styles.panel} aria-label="Orders">
            <OrderRows
              orders={list.data.orders}
              empty={view === "attention" ? "Nothing needs you right now." : "No orders here yet. Choose your workspace at checkout and the order appears here."}
            />
          </section>
          {list.data.nextCursor ? (
            <ButtonLink variant="secondary" href={`${href(view)}&cursor=${encodeURIComponent(list.data.nextCursor)}`}>
              Older orders
            </ButtonLink>
          ) : null}
          {query.cursor ? (
            <a className={styles.rowLink} href={href(view)}>
              Back to newest orders
            </a>
          ) : null}
          <p className={styles.support}>
            Orders you can see: {organization.me.allLocations ? "every location" : organization.me.locations.map((entry) => entry.name).join(", ")}
            {organization.me.permissions.includes("VIEW_RECORDS") ? "." : ", placed by you."} <a href={workspaceHref(organizationId, "", location)}>Back to the overview</a>
          </p>
        </>
      )}
    </WorkspaceShell>
  );
}
