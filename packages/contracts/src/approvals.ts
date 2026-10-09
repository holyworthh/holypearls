import { z } from "zod";

/*
 * Internal approval (T11-04; PRD-05 B2B-FR-040–042, 044; TECH-01 §4 order
 * request and organization approval). An organization chooses one rule;
 * requests that need it wait for someone with "Approve organization
 * requests". Approvals are insert-only: a new decision is a new record.
 */

const isoDate = z.iso.datetime();
const minor = z.string().regex(/^\d+$/, "Enter an amount in kobo");

/** One rule at launch (B2B-FR-040). */
export const APPROVAL_RULES = ["NONE", "ALL", "ABOVE_AMOUNT", "REQUESTERS"] as const;
export const approvalRuleSchema = z.enum(APPROVAL_RULES);
export type ApprovalRule = z.infer<typeof approvalRuleSchema>;

export const APPROVAL_RULE_LABELS: Record<ApprovalRule, string> = {
  NONE: "No approval",
  ALL: "Approve every request",
  ABOVE_AMOUNT: "Approve requests above an amount",
  REQUESTERS: "Approve requests from specific people",
};

export const approvalPolicySchema = z.object({
  rule: approvalRuleSchema,
  thresholdMinor: minor.nullable(),
  currency: z.enum(["NGN", "USD"]),
  /** Members whose requests need approval (rule REQUESTERS). */
  requesters: z.array(z.object({ membershipId: z.string(), name: z.string() })),
  /** "Separate requester and approver" (B2B-FR-041). */
  separateRequesterApprover: z.boolean(),
  canManage: z.boolean(),
  version: z.number().int(),
});
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;

export const updateApprovalPolicySchema = z
  .object({
    rule: approvalRuleSchema,
    thresholdMinor: minor.nullable().default(null),
    requesterMembershipIds: z.array(z.uuid()).max(500).default([]),
    separateRequesterApprover: z.boolean(),
    version: z.number().int(),
  })
  .refine((value) => value.rule !== "ABOVE_AMOUNT" || (value.thresholdMinor !== null && BigInt(value.thresholdMinor) > 0n), { message: "Enter the amount above which requests need approval", path: ["thresholdMinor"] })
  .refine((value) => value.rule !== "REQUESTERS" || value.requesterMembershipIds.length > 0, { message: "Choose at least one person", path: ["requesterMembershipIds"] });
export type UpdateApprovalPolicy = z.infer<typeof updateApprovalPolicySchema>;

/** DRAFT → PENDING_APPROVAL → APPROVED | REJECTED; APPROVED → SENT_TO_HOLYPEARLS; any before SENT → CANCELLED (TECH-01 §4). */
export const ORDER_REQUEST_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SENT_TO_HOLYPEARLS", "CANCELLED"] as const;
export const orderRequestStatusSchema = z.enum(ORDER_REQUEST_STATUSES);
export type OrderRequestStatus = z.infer<typeof orderRequestStatusSchema>;

export const APPROVAL_DECISIONS = ["APPROVED", "REJECTED", "CHANGES_REQUESTED"] as const;
export const approvalDecisionSchema = z.enum(APPROVAL_DECISIONS);

export const orderRequestSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: orderRequestStatusSchema,
  locationId: z.string(),
  locationName: z.string(),
  requestedBy: z.string(),
  estimatedTotalMinor: minor.nullable(),
  currency: z.enum(["NGN", "USD"]),
  createdAt: isoDate,
  /** Waiting for a decision this person can make. */
  needsMyDecision: z.boolean(),
});
export type OrderRequestSummary = z.infer<typeof orderRequestSummarySchema>;

export const orderRequestListSchema = z.object({ requests: z.array(orderRequestSummarySchema), canApprove: z.boolean() });
export type OrderRequestList = z.infer<typeof orderRequestListSchema>;

export const orderRequestSchema = orderRequestSummarySchema.extend({
  items: z.array(z.object({ configurationId: z.string(), productName: z.string(), quantity: z.number().int().nullable(), templateName: z.string().nullable(), totalMinor: minor.nullable() })),
  /** Why it needs approval, in the organization's words ("ACME policy: orders above ₦250,000 need an approver"). */
  policyNote: z.string().nullable(),
  approvals: z.array(z.object({ id: z.string(), decision: approvalDecisionSchema, amountMinor: minor.nullable(), note: z.string().nullable(), decidedBy: z.string().nullable(), createdAt: isoDate })),
  history: z.array(z.object({ label: z.string(), by: z.string().nullable(), at: isoDate })),
  quoteReference: z.string().nullable(),
  quoteId: z.string().nullable(),
  /** HolyPearls' quote came back above the approved amount and is waiting for a new approval (T11-04b; frame 73B). */
  reapproval: z.object({ approvedMinor: minor, quoteTotalMinor: minor, differenceMinor: minor, quoteVersion: z.number().int(), note: z.string().nullable() }).nullable(),
  canDecide: z.boolean(),
  /** Why this person can't decide, when they otherwise could (their own request with separation on). */
  decideBlockedReason: z.string().nullable(),
  canCancel: z.boolean(),
  canResubmit: z.boolean(),
  version: z.number().int(),
});
export type OrderRequest = z.infer<typeof orderRequestSchema>;

export const decideOrderRequestSchema = z
  .object({
    decision: z.enum(["APPROVE", "REQUEST_CHANGES", "DECLINE"]),
    /** The approved amount; defaults to the estimate. Needed when there's no estimate. */
    amountMinor: minor.nullable().default(null),
    note: z.string().trim().max(1000).nullable().default(null),
    version: z.number().int(),
  })
  .refine((value) => value.decision === "APPROVE" || Boolean(value.note), { message: "Add a note for the requester", path: ["note"] });
export type DecideOrderRequest = z.infer<typeof decideOrderRequestSchema>;

export const orderRequestActionSchema = z.object({ version: z.number().int() });

/** The organization's side of a quote (T11-04b; QUOTE-FR-020–022; frame 48): what was approved against the current quote. */
export const quoteOrganizationApprovalSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
  approvedMinor: minor.nullable(),
  approvedBy: z.string().nullable(),
  quoteTotalMinor: minor.nullable(),
  differenceMinor: minor.nullable(),
  reapprovalRequired: z.boolean(),
  reapprovalPending: z.boolean(),
  canSendForReapproval: z.boolean(),
  version: z.number().int(),
});
export type QuoteOrganizationApproval = z.infer<typeof quoteOrganizationApprovalSchema>;

export const requestReapprovalSchema = z.object({ note: z.string().trim().max(1000).nullable().default(null), version: z.number().int() });
