import { z } from "zod";
import { brandAssetSummarySchema, templateSummarySchema } from "./brand-assets.js";
import { collectionSummarySchema } from "./groups.js";
import { orderSummaryStatusSchema } from "./orders.js";
import { customerPaymentStatusSchema } from "./payments.js";
import { projectStatusSchema, quoteStatusSchema } from "./projects.js";

/*
 * The Brand Workspace's views (T10-03; PRD-05 B2B-FR-010–013). Every list is
 * a filtered view of the normal orders and projects (B2B-FR-011), limited to
 * the member's locations (TECH-03 §7).
 */

const isoDate = z.iso.datetime();
const minor = z.string().regex(/^-?\d+$/);

/** One order in a workspace list (Pen 63 · Jn2wL). */
export const workspaceOrderSchema = z.object({
  id: z.string(),
  number: z.string(),
  title: z.string(),
  locationName: z.string(),
  summaryStatus: orderSummaryStatusSchema,
  paymentStatus: customerPaymentStatusSchema.nullable(),
  /** Something here waits on the customer: a proof to approve or a payment to make. */
  needsYou: z.boolean(),
  /** "Approve badge proof · pay balance", "Nothing needed". */
  nextStep: z.string(),
  placedAt: isoDate,
  placedByYou: z.boolean(),
});
export type WorkspaceOrder = z.infer<typeof workspaceOrderSchema>;

export const WORKSPACE_ORDER_VIEWS = ["attention", "active", "complete", "all"] as const;
export const workspaceOrderViewSchema = z.enum(WORKSPACE_ORDER_VIEWS);
export type WorkspaceOrderView = z.infer<typeof workspaceOrderViewSchema>;

export const workspaceOrderListSchema = z.object({
  orders: z.array(workspaceOrderSchema),
  nextCursor: z.string().nullable(),
  counts: z.object({ attention: z.number().int(), active: z.number().int(), complete: z.number().int(), all: z.number().int() }),
});
export type WorkspaceOrderList = z.infer<typeof workspaceOrderListSchema>;

/** Project groups on the Projects index (Pen 64 · cNcKd). */
export const WORKSPACE_PROJECT_GROUPS = ["DRAFT", "QUOTE_PENDING", "QUOTE_READY", "ACTIVE_ORDER", "COMPLETE"] as const;
export const workspaceProjectGroupSchema = z.enum(WORKSPACE_PROJECT_GROUPS);
export type WorkspaceProjectGroup = z.infer<typeof workspaceProjectGroupSchema>;

export const workspaceProjectSchema = z.object({
  id: z.string(),
  reference: z.string().nullable(),
  title: z.string(),
  locationName: z.string(),
  status: projectStatusSchema,
  quoteStatus: quoteStatusSchema.nullable(),
  group: workspaceProjectGroupSchema,
  /** "Quote ready · valid until 18 Oct". */
  detail: z.string(),
  /** Only the person who placed it can open its builder or quote until T11-04. */
  href: z.string().nullable(),
  updatedAt: isoDate,
});
export type WorkspaceProject = z.infer<typeof workspaceProjectSchema>;

export const workspaceProjectListSchema = z.object({ projects: z.array(workspaceProjectSchema) });
export type WorkspaceProjectList = z.infer<typeof workspaceProjectListSchema>;

/** One Needs Attention row on the overview (Pen 28: proofs, balances, quotes). */
export const attentionItemSchema = z.object({
  kind: z.enum(["PROOF", "PAYMENT", "QUOTE", "APPROVAL"]),
  title: z.string(),
  detail: z.string(),
  actionLabel: z.string(),
  href: z.string(),
});
export type AttentionItem = z.infer<typeof attentionItemSchema>;

/** The overview (Pen 28 · e851AK, 62 · Rtyrl): Needs Attention, Quick Actions, Active Work (B2B-FR-010). */
export const workspaceOverviewSchema = z.object({
  needsAttention: z.array(attentionItemSchema),
  activeOrders: z.array(workspaceOrderSchema),
  activeProjects: z.array(workspaceProjectSchema),
  /** The person can place orders and projects for the organization. */
  canCreate: z.boolean(),
  canManageCollections: z.boolean(),
  templates: z.array(templateSummarySchema),
  groups: z.array(collectionSummarySchema),
});
export type WorkspaceOverview = z.infer<typeof workspaceOverviewSchema>;

/** Billing (Pen 130 · juM56): Owner and Admin only (B2B-FR-012). */
export const workspaceBillingSchema = z.object({
  totals: z.array(z.object({ currency: z.enum(["NGN", "USD"]), dueMinor: minor, paidThisYearMinor: minor, receiptsThisYear: z.number().int() })),
  receiptsNextCursor: z.string().nullable(),
  needsResolution: z.number().int(),
  balancesDue: z.array(
    z.object({
      orderId: z.string(),
      number: z.string(),
      locationName: z.string(),
      label: z.string(),
      amountMinor: minor,
      currency: z.enum(["NGN", "USD"]),
      paymentStatus: customerPaymentStatusSchema,
    }),
  ),
  receipts: z.array(
    z.object({
      id: z.string(),
      number: z.string(),
      orderId: z.string(),
      orderNumber: z.string(),
      locationName: z.string(),
      amountMinor: minor,
      currency: z.enum(["NGN", "USD"]),
      paidAt: isoDate,
      /** REFUNDED once a refund covers the order (refunds arrive with T13-05). */
      status: z.enum(["PAID", "REFUNDED", "PARTIALLY_REFUNDED", "PAYMENT_RESOLUTION_REQUIRED"]),
    }),
  ),
});
export type WorkspaceBilling = z.infer<typeof workspaceBillingSchema>;

/** Workspace search (Pen 130 · pjuPc): only records the person may see (B2B-FR-013). */
export const workspaceSearchSchema = z.object({
  query: z.string(),
  templates: z.array(templateSummarySchema),
  groups: z.array(collectionSummarySchema),
  assets: z.array(brandAssetSummarySchema),
  orders: z.array(workspaceOrderSchema),
  projects: z.array(workspaceProjectSchema),
});
export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;
