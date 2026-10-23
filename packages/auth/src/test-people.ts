import { type Transaction, newId, schema } from "@holypearls/db";
import { createOTP } from "@better-auth/utils/otp";
import { hashPassword, symmetricEncrypt } from "better-auth/crypto";

import type { StaffPermission } from "@holypearls/contracts";

/**
 * TEST DATA people (TECH-08 §11). The passwords and authenticator secrets are
 * test values that exist only in seeded and test databases.
 */
export interface TestPerson {
  key: string;
  name: string;
  email: string;
  password: string;
  staff?: { permissions: readonly StaffPermission[] };
  /** Raw authenticator secret; set means MFA is already set up. */
  totpSecret?: string;
}

export const TEST_PEOPLE = {
  adminAda: {
    key: "adminAda",
    name: "Ada Okafor (TEST DATA)",
    email: "ada.staff@holypearls.test",
    password: "test-password-ada-staff",
    staff: { permissions: ["STAFF_ADMIN", "SECURITY_ADMIN", "AUDIT_VIEW", "PAYMENT_VIEW", "PAYMENT_MANAGE", "CUSTOMER_SUPPORT", "CATALOGUE_MANAGE", "PRICING_MANAGE", "CONTENT_MANAGE", "QUOTE_MANAGE", "PROOF_MANAGE", "PRODUCTION_MANAGE", "FULFILMENT_MANAGE", "ORGANIZATION_SUPPORT", "ORGANIZATION_APPROVE", "EXPORT_PERSONAL_DATA", "REFUND_ISSUE"] },
    totpSecret: "hp-test-totp-secret-ada-0001",
  },
  adminTunde: {
    key: "adminTunde",
    name: "Tunde Bello (TEST DATA)",
    email: "tunde.staff@holypearls.test",
    password: "test-password-tunde-staff",
    staff: { permissions: ["STAFF_ADMIN"] },
    totpSecret: "hp-test-totp-secret-tunde-0001",
  },
  /** Finance staff who can see payments but not change them (PAYMENT_VIEW only). */
  financeFolake: {
    key: "financeFolake",
    name: "Folake Adebayo (TEST DATA)",
    email: "folake.staff@holypearls.test",
    password: "test-password-folake-staff",
    staff: { permissions: ["PAYMENT_VIEW"] },
    totpSecret: "hp-test-totp-secret-folake-0001",
  },
  catalogueNoMfa: {
    key: "catalogueNoMfa",
    name: "Kemi Adeyemi (TEST DATA)",
    email: "kemi.staff@holypearls.test",
    password: "test-password-kemi-staff",
    staff: { permissions: ["CATALOGUE_MANAGE"] },
  },
  customerChidi: {
    key: "customerChidi",
    name: "Chidi Eze (TEST DATA)",
    email: "chidi.customer@holypearls.test",
    password: "test-password-chidi-customer",
  },
  /** Used by tests that sign out everywhere, so other tests keep their sessions. */
  customerAmaka: {
    key: "customerAmaka",
    name: "Amaka Nwosu (TEST DATA)",
    email: "amaka.customer@holypearls.test",
    password: "test-password-amaka-customer",
  },
  /** ACME Hospitality Group (TEST DATA): Owner, all locations (TECH-08 §11). */
  acmeOwner: {
    key: "acmeOwner",
    name: "Ngozi Okafor (TEST DATA)",
    email: "ngozi.acme-owner@holypearls.test",
    password: "test-password-acmeowner",
  },
  /** ACME Hospitality Group (TEST DATA): Admin, all locations (TECH-08 §11). */
  acmeAdmin: {
    key: "acmeAdmin",
    name: "Bola Martins (TEST DATA)",
    email: "bola.acme-admin@holypearls.test",
    password: "test-password-acmeadmin",
  },
  /** ACME Hospitality Group (TEST DATA): Buyer, Victoria Island (TECH-08 §11). */
  acmeBuyer: {
    key: "acmeBuyer",
    name: "Tunde Ojo (TEST DATA)",
    email: "tunde.acme-buyer@holypearls.test",
    password: "test-password-acmebuyer",
  },
  /** ACME Hospitality Group (TEST DATA): Location Manager, Lekki (TECH-08 §11). */
  acmeLekkiManager: {
    key: "acmeLekkiManager",
    name: "Adaeze Eze (TEST DATA)",
    email: "adaeze.acme-manager@holypearls.test",
    password: "test-password-acmelekkimanager",
  },
  /** ACME Hospitality Group (TEST DATA): Approver, all locations (TECH-08 §11). */
  acmeApprover: {
    key: "acmeApprover",
    name: "Kemi Adebayo (TEST DATA)",
    email: "kemi.acme-approver@holypearls.test",
    password: "test-password-acmeapprover",
  },
  /** ACME Hospitality Group (TEST DATA): Viewer, Lekki (TECH-08 §11). */
  acmeViewer: {
    key: "acmeViewer",
    name: "Sam Etim (TEST DATA)",
    email: "sam.acme-viewer@holypearls.test",
    password: "test-password-acmeviewer",
  },
} as const satisfies Record<string, TestPerson>;

export type TestPersonKey = keyof typeof TEST_PEOPLE;

/** The current 6-digit code for a test person's authenticator. */
export async function totpCode(secret: string): Promise<string> {
  return createOTP(secret, { digits: 6, period: 30 }).totp();
}

/** Inserts a test person with a password, and staff profile and MFA when set. */
export async function insertTestPerson(tx: Transaction, person: TestPerson, authSecret: string): Promise<string> {
  const userId = newId();
  await tx.insert(schema.users).values({
    id: userId,
    name: person.name,
    email: person.email,
    emailVerified: true,
    twoFactorEnabled: Boolean(person.totpSecret),
  });
  await tx.insert(schema.accounts).values({
    userId,
    accountId: userId,
    providerId: "credential",
    password: await hashPassword(person.password),
  });
  if (person.totpSecret) {
    await tx.insert(schema.twoFactors).values({
      userId,
      secret: await symmetricEncrypt({ key: authSecret, data: person.totpSecret }),
      backupCodes: await symmetricEncrypt({ key: authSecret, data: "[]" }),
      verified: true,
    });
  }
  if (person.staff) {
    const [profile] = await tx
      .insert(schema.staffProfiles)
      .values({ userId, displayName: person.name })
      .returning({ id: schema.staffProfiles.id });
    await tx
      .insert(schema.staffPermissionGrants)
      .values(person.staff.permissions.map((permission) => ({ staffProfileId: profile!.id, permission })));
  }
  return userId;
}
