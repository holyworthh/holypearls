import type { AttentionItem, WorkspaceBilling, WorkspaceOrder, WorkspaceOrderList, WorkspaceOrderView, WorkspaceOverview, WorkspaceProjectList, WorkspaceSearch } from "@holypearls/contracts";
import { and, type Database, eq, schema } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { isComplete, type OrderCard, organizationBilling, organizationOrders } from "../orders/workspace.js";
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

const money = (minor: bigint, currency: string) => `${currency === "USD" ? "$" : "₦"}${(minor / 100n).toLocaleString("en-NG")}.${(minor % 100n).toString().padStart(2, "0")}`;

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
    const [location] = await db.select({ id: schema.locations.id }).from(schema.locations).where(and(eq(schema.locations.id, locationId), eq(schema.locations.organizationId, organizationId)));
    if (!location) throw new AppError("NOT_FOUND");
  }
  return { member, scope: scopeFor(member, locationId) };
}

export async function workspaceOverview(db: Database, actor: ActorContext, organizationId: string, locationId?: string | null): Promise<WorkspaceOverview> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  const [orders, projects] = await Promise.all([organizationOrders(db, scope, member.userId, { limit: 30 }), organizationProjects(db, scope, member.userId, { limit: 30 })]);
  const needsAttention: AttentionItem[] = [];
  for (const order of orders.filter((row) => row.needsYou)) {
    needsAttention.push({
      kind: order.balance && !order.nextStep.startsWith("Approve") ? "PAYMENT" : "PROOF",
      title: `${order.nextStep} · ${order.title}`,
      detail: `${order.number}${order.locationName ? ` · ${order.locationName}` : ""}${order.balance ? ` · ${money(order.balance.amountMinor, order.currency)} due` : ""}`,
      actionLabel: "Open order",
      href: `/orders/${order.id}`,
    });
  }
  for (const project of projects.filter((row) => row.group === "QUOTE_READY")) {
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
    activeOrders: orders.filter((order) => !isComplete(order)).slice(0, 6).map(publicOrder),
    activeProjects: projects.filter((project) => project.group !== "COMPLETE").slice(0, 6),
    canCreate: member.permissions.has("CREATE_REQUESTS"),
  };
}

export async function workspaceOrders(db: Database, actor: ActorContext, organizationId: string, view: WorkspaceOrderView, locationId?: string | null): Promise<WorkspaceOrderList> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  const all = await organizationOrders(db, scope, member.userId, { limit: 200 });
  const groups = {
    attention: all.filter((order) => order.needsYou),
    active: all.filter((order) => !isComplete(order)),
    complete: all.filter((order) => isComplete(order)),
    all,
  };
  return {
    orders: groups[view].map(publicOrder),
    counts: { attention: groups.attention.length, active: groups.active.length, complete: groups.complete.length, all: all.length },
  };
}

export async function workspaceProjects(db: Database, actor: ActorContext, organizationId: string, locationId?: string | null): Promise<WorkspaceProjectList> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  return { projects: await organizationProjects(db, scope, member.userId) };
}

/** Billing is for Owner and Admin (VIEW_BILLING); anyone else gets 403 (B2B-FR-012). */
export async function workspaceBilling(db: Database, actor: ActorContext, organizationId: string, locationId?: string | null): Promise<WorkspaceBilling> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  enforce(needsPermission(member, "VIEW_BILLING"));
  return organizationBilling(db, scope, member.userId, actor.now);
}

/** Search finds only what the person may see, never another location (B2B-FR-013). Assets, templates and groups join in T11 and T12. */
export async function workspaceSearch(db: Database, actor: ActorContext, organizationId: string, query: string, locationId?: string | null): Promise<WorkspaceSearch> {
  const { member, scope } = await context(db, actor, organizationId, locationId);
  const text = query.trim().slice(0, 100);
  if (text.length < 2) return { query: text, orders: [], projects: [] };
  const [orders, projects] = await Promise.all([organizationOrders(db, scope, member.userId, { query: text, limit: 20 }), organizationProjects(db, scope, member.userId, { query: text, limit: 20 })]);
  return { query: text, orders: orders.map(publicOrder), projects };
}
