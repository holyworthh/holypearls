import { TEST_PEOPLE, type TestPersonKey } from "@holypearls/auth";
import { ORGANIZATION_PERMISSIONS, type OrganizationRole, ROLE_PRESETS } from "@holypearls/contracts";
import { eq, inArray, schema, type Transaction } from "@holypearls/db";
import { createHash, randomBytes } from "node:crypto";

export const ACME_NAME = "ACME Hospitality Group (TEST DATA)";
export const ACME_LOCATIONS = [
  { name: "Lekki", city: "Lagos" },
  { name: "Victoria Island", city: "Lagos" },
] as const;

/** One member per role (TECH-08 §11). Null locations means All locations. */
const ACME_MEMBERS: readonly { person: TestPersonKey; role: OrganizationRole; locations: readonly string[] | null }[] = [
  { person: "acmeOwner", role: "OWNER", locations: null },
  { person: "acmeAdmin", role: "ADMIN", locations: null },
  { person: "acmeBuyer", role: "BUYER", locations: ["Victoria Island"] },
  { person: "acmeLekkiManager", role: "LOCATION_MANAGER", locations: ["Lekki"] },
  { person: "acmeApprover", role: "APPROVER", locations: null },
  { person: "acmeViewer", role: "VIEWER", locations: ["Lekki"] },
];

const DAY_MS = 86_400_000;
/** Seeded invitations get secrets nobody knows: they only show the Pen's "invite pending" and "invite expired" chips. */
const unknownSecretHash = () => createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url");

/** ACME, its two locations, one member per role, and one pending and one expired invitation. Runs once. */
export async function seedOrganizations(tx: Transaction) {
  const [existing] = await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.name, ACME_NAME));
  if (existing) return;
  const [organization] = await tx.insert(schema.organizations).values({ name: ACME_NAME }).returning({ id: schema.organizations.id });
  const organizationId = organization!.id;
  const locations = await tx
    .insert(schema.locations)
    .values(ACME_LOCATIONS.map((location) => ({ organizationId, ...location })))
    .returning({ id: schema.locations.id, name: schema.locations.name });
  const locationId = new Map(locations.map((location) => [location.name, location.id]));
  const emails = ACME_MEMBERS.map((member) => TEST_PEOPLE[member.person].email);
  const users = await tx.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.email, emails));
  const userId = new Map(users.map((user) => [user.email, user.id]));
  for (const member of ACME_MEMBERS) {
    const [membership] = await tx
      .insert(schema.memberships)
      .values({ organizationId, userId: userId.get(TEST_PEOPLE[member.person].email)!, role: member.role, allLocations: member.locations === null })
      .returning({ id: schema.memberships.id });
    const permissions = member.role === "OWNER" ? ORGANIZATION_PERMISSIONS : ROLE_PRESETS[member.role];
    await tx.insert(schema.membershipPermissions).values(permissions.map((permission) => ({ membershipId: membership!.id, permission })));
    for (const name of member.locations ?? []) {
      await tx.insert(schema.membershipLocations).values({ membershipId: membership!.id, organizationId, locationId: locationId.get(name)! });
    }
  }
  const owner = userId.get(TEST_PEOPLE.acmeOwner.email)!;
  const now = Date.now();
  const invitations = await tx
    .insert(schema.invitations)
    .values([
      { secretHash: unknownSecretHash(), emailNormalized: "kemi.a@acme.test", role: "BUYER", organizationId, invitedByUserId: owner, expiresAt: new Date(now + 5 * DAY_MS) },
      { secretHash: unknownSecretHash(), emailNormalized: "sam.e@acme.test", role: "VIEWER", status: "EXPIRED", organizationId, invitedByUserId: owner, expiresAt: new Date(now - 2 * DAY_MS) },
    ] as const)
    .returning({ id: schema.invitations.id });
  await tx.insert(schema.invitationLocations).values([
    { invitationId: invitations[0]!.id, organizationId, locationId: locationId.get("Victoria Island")! },
    { invitationId: invitations[1]!.id, organizationId, locationId: locationId.get("Lekki")! },
  ]);
}
