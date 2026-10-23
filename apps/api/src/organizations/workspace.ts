import type {
  AttentionItem,
  WorkspaceBilling,
  WorkspaceOrder,
  WorkspaceOrderList,
  WorkspaceOrderView,
  WorkspaceOverview,
  WorkspaceProjectList,
  WorkspaceSearch,
} from "@holypearls/contracts";
import { displayMoney } from "@holypearls/contracts";
import { listCollections } from "../groups/collections.js";
import { listOrderRequests } from "./approvals.js";
import { listBrandAssets } from "./assets.js";
import { listTemplates } from "./templates.js";
import { and, type Database, eq, schema } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { type OrderCard, organizationBilling, organizationOrderCounts, organizationOrders } from "../orders/workspace.js";
import { pageOf } from "../platform/cursor.js";
import { enforce } from "../platform/policy.js";
import { organizationProjects } from "../projects/workspace.js";
import { requireMember } from "./members.js";
import { needsPermission } from "./policies.js";
import { scopeFor } from "./scope.js";

/*
 * The Brand Workspace views (T10-03; PRD-05 B2B-FR-010–013). Each one is a
 * filtered view of the normal orders and projects (B2B-FR-011), limited to
 * the member's locations, or one of them chosen in the switcher. A location
 * outside the member's is 404 (TECH-03 §7, §12).
 */

const money = displayMoney;

/** The card without the internal balance, which only billing uses. */
const publicOrder = (card: OrderCard): WorkspaceOrder => {
  const { balance, currency, ...order } = card;
  void balance;
  void currency;
  return order;
};

async function context(db: Database, actor: ActorContext, organizationId: string, locationId?: string | null) {
  const member = await requireMember(db, actor, organizationId);
  // Members with All locations still can't name another organization's location.
  if (locationId) {
    const [location] = await db
      .select({ id: schema.locations.id })
      .from(schema.locations)
      .where(and(eq(schema.locations.id, locationId), eq(schema.locations.organizationId, organizationId)));
    if (!location) throw new AppError("NOT_FOUND");
  }
  return { member, scope: scopeFor(member, locationId) };
}

export async function workspaceOverview(db: Database, actor: ActorContext, organizationId: string, locationId?: string | null): Promise<WorkspaceOverview> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  const [orders, active, projects, quoteReady, requests, templates, groups] = await Promise.all([
    organizationOrders(db, scope, member.userId, { view: "attention", limit: 8 }),
    organizationOrders(db, scope, member.userId, { view: "active", limit: 6 }),
    organizationProjects(db, scope, member.userId, { active: true, limit: 6 }),
    organizationProjects(db, scope, member.userId, { quoteReady: true, limit: 8 }),
    listOrderRequests(db, actor, organizationId, { needsDecision: true, locationId, limit: 8 }),
    listTemplates(db, actor, organizationId, { approved: true, locationId, limit: 3 }),
    listCollections(db, actor, organizationId, { active: true, locationId, limit: 3 }),
  ]);
  const needsAttention: AttentionItem[] = requests.requests.map((request) => ({
    kind: "APPROVAL",
    title: `Approve ${request.title}`,
    detail: `${request.requestedBy} · ${request.locationName}`,
    actionLabel: "Review request",
    href: `/workspace/${organizationId}/approvals/${request.id}`,
  }));
  for (const order of orders.filter((row) => row.needsYou)) {
    needsAttention.push({
      kind: !order.nextStep.startsWith("Approve") ? "PAYMENT" : "PROOF",
      title: `${order.nextStep} · ${order.title}`,
      detail: `${order.number}${order.locationName ? ` · ${order.locationName}` : ""}${order.balance ? ` · ${money(order.balance.amountMinor, order.currency)} due` : ""}`,
      actionLabel: "Open order",
      href: `/orders/${order.id}`,
    });
  }
  for (const project of quoteReady) {
    needsAttention.push({
      kind: "QUOTE",
      title: `Review the quote · ${project.title}`,
      detail: `${project.reference ?? ""}${project.locationName ? ` · ${project.locationName}` : ""}`,
      actionLabel: "Review quote",
      href: project.href ?? `/workspace/${organizationId}/projects`,
    });
  }
  return {
    needsAttention: needsAttention.slice(0, 8),
    activeOrders: active.map(publicOrder),
    activeProjects: projects.filter((project) => project.group !== "COMPLETE").slice(0, 6),
    canCreate: member.permissions.has("CREATE_REQUESTS"),
    canManageCollections: groups.canManage,
    templates: templates.templates,
    groups: groups.collections,
  };
}

export async function workspaceOrders(
  db: Database,
  actor: ActorContext,
  organizationId: string,
  view: WorkspaceOrderView,
  locationId?: string | null,
  cursor?: string,
): Promise<WorkspaceOrderList> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  const [page, counts] = await Promise.all([organizationOrders(db, scope, member.userId, { view, cursor, limit: 51 }), organizationOrderCounts(db, scope)]);
  const { page: rows, nextCursor } = pageOf(page, 50, (row) => ({ at: new Date(row.placedAt), id: row.id }));
  return { orders: rows.map(publicOrder), counts, nextCursor };
}

export async function workspaceProjects(db: Database, actor: ActorContext, organizationId: string, locationId?: string | null): Promise<WorkspaceProjectList> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  return { projects: await organizationProjects(db, scope, member.userId) };
}

/** Billing is for Owner and Admin (VIEW_BILLING); anyone else gets 403 (B2B-FR-012). */
export async function workspaceBilling(db: Database, actor: ActorContext, organizationId: string, locationId?: string | null, cursor?: string): Promise<WorkspaceBilling> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  enforce(needsPermission(member, "VIEW_BILLING"));
  return organizationBilling(db, scope, member.userId, actor.now, cursor);
}

/** Search finds only what the person may see, never another location (B2B-FR-013). Includes the existing assets, templates and groups. */
export async function workspaceSearch(db: Database, actor: ActorContext, organizationId: string, query: string, locationId?: string | null): Promise<WorkspaceSearch> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  const text = query.trim().slice(0, 100);
  if (text.length < 2) return { query: text, orders: [], projects: [], assets: [], templates: [], groups: [] };
  const [orders, projects, assets, templates, groups] = await Promise.all([
    organizationOrders(db, scope, member.userId, { query: text, limit: 20 }),
    organizationProjects(db, scope, member.userId, { query: text, limit: 20 }),
    listBrandAssets(db, actor, organizationId, { query: text }),
    listTemplates(db, actor, organizationId, { query: text, locationId, limit: 20 }),
    listCollections(db, actor, organizationId, { query: text, locationId, limit: 20 }),
  ]);
  return { query: text, orders: orders.map(publicOrder), projects, assets: assets.assets.slice(0, 20), templates: templates.templates, groups: groups.collections };
}
