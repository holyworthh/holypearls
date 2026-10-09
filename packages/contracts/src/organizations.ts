import { z } from "zod";

const isoDate = z.iso.datetime();

/** Organization roles (PRD-05 B2B-FR-003). A role is a preset of permissions (TECH-03 §7). */
export const ORGANIZATION_ROLES = ["OWNER", "ADMIN", "BUYER", "LOCATION_MANAGER", "APPROVER", "VIEWER"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES);

/**
 * Organization permissions (TECH-03 §7). Transferring ownership is not a
 * permission: it belongs to the Owner role, so the last-owner rule holds.
 * "All locations" is a membership setting, not a permission.
 */
export const ORGANIZATION_PERMISSIONS = [
  "VIEW_RECORDS",
  "CREATE_REQUESTS",
  "APPROVE_REQUESTS",
  "ACCEPT_QUOTES",
  "MANAGE_BRAND",
  "MANAGE_COLLECTIONS",
  "MANAGE_STORES",
  "MANAGE_TEAM",
  "VIEW_BILLING",
  "EXPORT_DATA",
] as const;
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];
export const organizationPermissionSchema = z.enum(ORGANIZATION_PERMISSIONS);

/** The TECH-03 §7 table. Buyers lack VIEW_RECORDS: they see only their own records. */
export const ROLE_PRESETS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  OWNER: ORGANIZATION_PERMISSIONS,
  ADMIN: ["VIEW_RECORDS", "CREATE_REQUESTS", "ACCEPT_QUOTES", "MANAGE_BRAND", "MANAGE_COLLECTIONS", "MANAGE_STORES", "MANAGE_TEAM", "VIEW_BILLING", "EXPORT_DATA"],
  BUYER: ["CREATE_REQUESTS", "MANAGE_COLLECTIONS"],
  LOCATION_MANAGER: ["VIEW_RECORDS", "CREATE_REQUESTS", "MANAGE_COLLECTIONS"],
  APPROVER: ["VIEW_RECORDS", "APPROVE_REQUESTS"],
  VIEWER: ["VIEW_RECORDS"],
};

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  BUYER: "Buyer",
  LOCATION_MANAGER: "Location Manager",
  APPROVER: "Approver",
  VIEWER: "Viewer",
};

export const PERMISSION_LABELS: Record<OrganizationPermission, string> = {
  VIEW_RECORDS: "View organization records",
  CREATE_REQUESTS: "Create orders, projects and order requests",
  APPROVE_REQUESTS: "Approve organization requests",
  ACCEPT_QUOTES: "Accept HolyPearls quotes",
  MANAGE_BRAND: "Manage brand assets and templates",
  MANAGE_COLLECTIONS: "Manage group collections",
  MANAGE_STORES: "Manage company stores and allowances",
  MANAGE_TEAM: "Manage team and roles",
  VIEW_BILLING: "View billing",
  EXPORT_DATA: "Export organization data",
};

export const MEMBERSHIP_STATUSES = ["ACTIVE", "DEACTIVATED"] as const;
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);

export const INVITATION_STATUSES = ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"] as const;
export const invitationStatusSchema = z.enum(INVITATION_STATUSES);

/** Invitations expire after 7 days and work once (B2B-FR-090, TECH-03 §11). */
export const INVITATION_VALID_DAYS = 7;

/** A raising change answers RULE_FAILED with this reason and what it would add, until it is confirmed (B2B-FR-091). */
export const CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED";

const locationRef = z.object({ id: z.string(), name: z.string() });

/** The signed-in person's own place in an organization. Display only; the server checks again (TECH-03 §12). */
export const myMembershipSchema = z.object({
  membershipId: z.string(),
  role: organizationRoleSchema,
  permissions: z.array(organizationPermissionSchema),
  allLocations: z.boolean(),
  locations: z.array(locationRef),
});
export type MyMembership = z.infer<typeof myMembershipSchema>;

export const myOrganizationSchema = z.object({ id: z.string(), name: z.string(), me: myMembershipSchema });
export type MyOrganization = z.infer<typeof myOrganizationSchema>;
export const myOrganizationsSchema = z.object({ organizations: z.array(myOrganizationSchema) });
export type MyOrganizations = z.infer<typeof myOrganizationsSchema>;

/* Locations (B2B-FR-002, Pen frame 71). */

export const locationInputSchema = z.object({
  name: z.string().trim().min(1, "Enter the location's name").max(80, "Use 80 characters or fewer"),
  city: z.string().trim().min(1, "Enter the city").max(80, "Use 80 characters or fewer"),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const locationSummarySchema = z.object({ id: z.string(), name: z.string(), city: z.string(), memberCount: z.number().int().nonnegative() });
export type LocationSummary = z.infer<typeof locationSummarySchema>;

export const locationMemberSchema = z.object({ membershipId: z.string(), name: z.string(), role: organizationRoleSchema, allLocations: z.boolean() });

export const locationDetailSchema = locationSummarySchema.extend({ members: z.array(locationMemberSchema), version: z.number().int() });
export type LocationDetail = z.infer<typeof locationDetailSchema>;

export const locationListSchema = z.object({ locations: z.array(locationSummarySchema) });
export type LocationList = z.infer<typeof locationListSchema>;

export const locationUpdateSchema = locationInputSchema.extend({ version: z.number().int() });

/* Team (B2B-FR-090–093, Pen frame 70). */

export const teamMemberSchema = z.object({
  membershipId: z.string(),
  name: z.string(),
  email: z.string(),
  role: organizationRoleSchema,
  status: membershipStatusSchema,
  allLocations: z.boolean(),
  locations: z.array(locationRef),
  permissions: z.array(organizationPermissionSchema),
  /** The Owner changed this member's permissions away from the role preset. */
  adjusted: z.boolean(),
  isYou: z.boolean(),
  version: z.number().int(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamInvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: organizationRoleSchema,
  allLocations: z.boolean(),
  locations: z.array(locationRef),
  status: invitationStatusSchema,
  expiresAt: isoDate,
  createdAt: isoDate,
});
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;

export const teamSchema = z.object({
  members: z.array(teamMemberSchema),
  invitations: z.array(teamInvitationSchema),
  activeOwners: z.number().int(),
});
export type Team = z.infer<typeof teamSchema>;

const scope = {
  allLocations: z.boolean(),
  locationIds: z.array(z.uuid()).max(100).default([]),
};
const needsLocations = (value: { allLocations: boolean; locationIds: string[] }) => value.allLocations || value.locationIds.length > 0;
const locationsMessage = { message: "Choose at least one location, or All locations", path: ["locationIds"] };

/** Owners aren't invited: an Owner makes someone Owner after they join. */
export const inviteInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254, "Use 254 characters or fewer").pipe(z.email("Enter an email like name@company.com")),
    role: organizationRoleSchema.exclude(["OWNER"]),
    ...scope,
  })
  .refine(needsLocations, locationsMessage);
export type InviteInput = z.infer<typeof inviteInputSchema>;

/** `permissions` null keeps the role preset; a list adjusts it (Owners only). */
export const memberChangeSchema = z
  .object({
    role: organizationRoleSchema,
    ...scope,
    permissions: z.array(organizationPermissionSchema).nullable().default(null),
    version: z.number().int(),
    confirmed: z.boolean().default(false),
  })
  .refine(needsLocations, locationsMessage);
export type MemberChange = z.infer<typeof memberChangeSchema>;

export const memberStatusChangeSchema = z.object({ version: z.number().int(), confirmed: z.boolean().default(false) });
export type MemberStatusChange = z.infer<typeof memberStatusChangeSchema>;

export const ownershipTransferSchema = z.object({
  membershipId: z.uuid(),
  /** The current Owner becomes an Admin. */
  stepDown: z.boolean(),
  confirmed: z.boolean().default(false),
});
export type OwnershipTransfer = z.infer<typeof ownershipTransferSchema>;

/* Accepting an invitation (TECH-03 §11). */

export const INVITATION_TOKEN_HEADER = "x-hp-invitation";

export const invitationPreviewSchema = z.object({
  status: invitationStatusSchema,
  organizationName: z.string(),
  role: organizationRoleSchema,
  /** "ad***@acme.example": enough to recognise. */
  invitedEmail: z.string(),
  expiresAt: isoDate,
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(200) });
export const acceptedInvitationSchema = z.object({ organizationId: z.string() });

/* Workspace requests: owner decision of 2026-10-08 (no PRD covers it). */

export const TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;
export const teamSizeSchema = z.enum(TEAM_SIZES);

export const ORGANIZATION_REQUEST_STATUSES = ["PENDING", "APPROVED", "DECLINED"] as const;
export const organizationRequestStatusSchema = z.enum(ORGANIZATION_REQUEST_STATUSES);

export const organizationRequestInputSchema = z.object({
  companyName: z.string().trim().min(2, "Enter your company's name").max(120, "Use 120 characters or fewer"),
  locations: z
    .array(locationInputSchema)
    .min(1, "Add at least one location")
    .max(20, "Add up to 20 locations; you can add more later")
    .refine((rows) => new Set(rows.map((row) => row.name.toLowerCase())).size === rows.length, "Give each location a different name"),
  teamSize: teamSizeSchema,
  note: z.string().trim().max(1000, "Use 1,000 characters or fewer").nullable().default(null),
});
export type OrganizationRequestInput = z.infer<typeof organizationRequestInputSchema>;

export const organizationRequestSchema = z.object({
  id: z.string(),
  status: organizationRequestStatusSchema,
  companyName: z.string(),
  locations: z.array(locationInputSchema),
  teamSize: teamSizeSchema,
  note: z.string().nullable(),
  createdAt: isoDate,
  decidedAt: isoDate.nullable(),
  declineReason: z.string().nullable(),
  organizationId: z.string().nullable(),
});
export type OrganizationRequest = z.infer<typeof organizationRequestSchema>;

/** The person's latest request, or null. */
export const myOrganizationRequestSchema = z.object({ request: organizationRequestSchema.nullable() });
export type MyOrganizationRequest = z.infer<typeof myOrganizationRequestSchema>;

export const adminOrganizationRequestSchema = organizationRequestSchema.extend({
  requester: z.object({ userId: z.string(), name: z.string(), email: z.string(), emailVerified: z.boolean() }),
  decidedBy: z.string().nullable(),
});
export type AdminOrganizationRequest = z.infer<typeof adminOrganizationRequestSchema>;

export const adminOrganizationRequestListSchema = z.object({ requests: z.array(adminOrganizationRequestSchema) });
export type AdminOrganizationRequestList = z.infer<typeof adminOrganizationRequestListSchema>;

export const declineOrganizationRequestSchema = z.object({
  reason: z.string().trim().min(5, "Tell the customer why, in a sentence").max(1000, "Use 1,000 characters or fewer"),
});

/* Staff support view (OPS-FR-080–081): read only. */

export const adminOrganizationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  locationCount: z.number().int(),
  activeMembers: z.number().int(),
  createdAt: isoDate,
});
export const adminOrganizationListSchema = z.object({ organizations: z.array(adminOrganizationSummarySchema) });
export type AdminOrganizationList = z.infer<typeof adminOrganizationListSchema>;

export const adminOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: isoDate,
  locations: z.array(locationSummarySchema),
  members: z.array(teamMemberSchema.omit({ isYou: true, version: true })),
  invitations: z.array(teamInvitationSchema),
  /** Brand assets, read only (OPS-FR-081). */
  assets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      latestNumber: z.number().int(),
      latestStatus: z.string(),
      currentNumber: z.number().int().nullable(),
    }),
  ),
});
export type AdminOrganization = z.infer<typeof adminOrganizationSchema>;
