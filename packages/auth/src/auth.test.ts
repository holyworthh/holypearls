import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it } from "vitest";
import { MemoryOutbox } from "./outbox.js";
import { TEST_PEOPLE, totpCode } from "./test-people.js";

describe("test people", () => {
  it("are labelled TEST DATA and use the .test domain", () => {
    for (const person of Object.values(TEST_PEOPLE)) {
      expect(person.name).toContain("(TEST DATA)");
      expect(person.email).toMatch(/@holypearls\.test$/);
      expect(person.password.length).toBeGreaterThanOrEqual(12);
    }
  });

  it("include two STAFF_ADMIN users with MFA so nobody is locked out (TECH-03 §10)", () => {
    const admins = Object.values(TEST_PEOPLE).filter(
      (person) => "staff" in person && (person.staff.permissions as readonly string[]).includes("STAFF_ADMIN"),
    );
    expect(admins).toHaveLength(2);
    expect(admins.every((person) => "totpSecret" in person)).toBe(true);
  });

  it("produce the authenticator's current 6-digit code", async () => {
    const secret = TEST_PEOPLE.adminAda.totpSecret;
    const code = await totpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    await expect(createOTP(secret, { digits: 6, period: 30 }).verify(code)).resolves.toBe(true);
  });
});

describe("memory outbox", () => {
  it("keeps sign-in emails in memory, newest last", async () => {
    const outbox = new MemoryOutbox();
    await outbox.send({ kind: "MAGIC_LINK", to: "a@holypearls.test", url: "https://x/1", sentAt: new Date() });
    await outbox.send({ kind: "MAGIC_LINK", to: "a@holypearls.test", url: "https://x/2", sentAt: new Date() });
    expect(outbox.latestTo("A@holypearls.test")?.url).toBe("https://x/2");
    expect(outbox.latestTo("b@holypearls.test")).toBeUndefined();
  });
});
