import { TEST_PEOPLE } from "@holypearls/auth";
import {
  adminHelpRequestSchema,
  helpInboxSchema,
  helpRequestSchema,
  notificationEntrySchema,
  notificationPageSchema,
} from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import { MemorySender } from "@holypearls/email";
import { Jobs } from "@holypearls/jobs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createGuestLink,
  ensureGuestCustomer,
  linkCustomersToVerifiedEmail,
  requireRecentEmailCode,
} from "../identity/customers.js";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_HELP_INBOX, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { markNotificationFailed, sendNotification } from "./notifications.js";

let harness: Harness;
let worker: Jobs;
let actors: Partial<Actors>;
const sender = new MemorySender();

const until = async (check: () => Promise<boolean>, timeoutMs = 45_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Timed out waiting");
};

const notification = async (id: string) => {
  const [row] = await harness.database.db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
  return row!;
};

const cookieFrom = (response: request.Response, name: string) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).find((line) => line.startsWith(`${name}=`));

beforeAll(async () => {
  harness = await createHarness({ demoSlice: true });
  actors = await signInActors(harness, ["adminAda", "adminTunde", "customerChidi"]);
  // The worker, in-process: the same services apps/worker runs.
  worker = new Jobs({
    connectionString: harness.database.url,
    role: "worker",
    settings: { "email.send": { retryLimit: 2, retryDelay: 1, retryBackoff: false } },
  });
  await worker.start();
  await worker.work("email.send", (payload) => sendNotification(harness.database.db, sender, TEST_SEAL_KEY, payload.notificationId), {
    pollingIntervalSeconds: 0.5,
  });
  await worker.workDeadLetters("email.send", (payload) => markNotificationFailed(harness.database.db, payload.notificationId), {
    pollingIntervalSeconds: 0.5,
  });
});

afterAll(async () => {
  await worker?.stop(1000);
  await harness?.close();
});

describe("email notifications (TECH-02 §10)", () => {
  it("renders and sends a test email through the email.send job", async () => {
    const queued = notificationEntrySchema.parse((await as(harness, actors.adminAda!).post("/v1/admin/notifications/test")).body);
    expect(queued.status).toBe("QUEUED");
    await until(async () => (await notification(queued.id)).status === "SENT");
    const email = sender.latestTo(TEST_PEOPLE.adminAda.email)!;
    expect(email.subject).toBe("HolyPearls test email");
    expect(email.html).toContain("Email is working");
    expect((await notification(queued.id)).attempts).toBe(1);
  });

  it("retries a failing send, then shows FAILED in admin, and resending makes a new record", async () => {
    sender.failNext = 100;
    try {
      const queued = notificationEntrySchema.parse((await as(harness, actors.adminAda!).post("/v1/admin/notifications/test")).body);
      await until(async () => (await notification(queued.id)).status === "FAILED", 60_000);
      const failed = notificationEntrySchema.parse((await as(harness, actors.adminAda!).get(`/v1/admin/notifications/${queued.id}`)).body);
      expect(failed).toMatchObject({ status: "FAILED", attempts: 3, lastError: "Mailbox unavailable (550)", resendable: true });

      const log = notificationPageSchema.parse((await as(harness, actors.adminAda!).get("/v1/admin/notifications?status=FAILED")).body);
      expect(log.entries.map((entry) => entry.id)).toContain(queued.id);

      sender.failNext = 0;
      const resent = notificationEntrySchema.parse((await as(harness, actors.adminAda!).post(`/v1/admin/notifications/${queued.id}/resend`)).body);
      expect(resent).toMatchObject({ status: "QUEUED", resendOfId: queued.id });
      expect(resent.id).not.toBe(queued.id);
      await until(async () => (await notification(resent.id)).status === "SENT");
      expect((await notification(queued.id)).status).toBe("FAILED");
    } finally {
      sender.failNext = 0;
    }
  });

  it("never resends an email that carried a sign-in link or code, and wipes its data once sent", async () => {
    await request(harness.url)
      .post("/v1/auth/sign-in/magic-link")
      .set("origin", TEST_WEB_ORIGIN)
      .send({ email: TEST_PEOPLE.customerChidi.email, callbackURL: "/account/security" });
    // The test harness keeps sign-in links in memory; queue one as the API does in production.
    const { queueEmail } = await import("./notifications.js");
    const id = await queueEmail({ db: harness.database.db, jobs: harness.jobs, sealKey: TEST_SEAL_KEY }, harness.database.db, {
      template: "sign_in_link",
      to: TEST_PEOPLE.customerChidi.email,
      data: { url: `${TEST_WEB_ORIGIN}/api/v1/auth/magic-link/verify?token=secret-token` },
      requestId: "req_test",
    });
    await until(async () => (await notification(id)).status === "SENT");
    expect((await notification(id)).sealedData).toBeNull();
    const response = await as(harness, actors.adminAda!).post(`/v1/admin/notifications/${id}/resend`);
    expect(response.status).toBe(422);
    expect(response.body.context).toEqual({ reason: "CARRIES_SECRET" });
  });

  it("is only for CUSTOMER_SUPPORT staff", async () => {
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/notifications"));
    expect((await as(harness, actors.adminTunde!).get("/v1/admin/notifications")).status).toBe(403);
  });

  it("is never sent directly by a controller", () => {
    const root = join(import.meta.dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) files.push(path);
      }
    };
    walk(root);
    const offenders = files.filter((path) => {
      const source = readFileSync(path, "utf8");
      const sendsDirectly = /createEmailSender|ResendSender|SmtpSender|renderTemplate|\bsender\.send\(/.test(source);
      return sendsDirectly && !path.endsWith(join("platform", "notifications.ts"));
    });
    expect(offenders).toEqual([]);
  });
});

describe("guest links (TECH-03 §5)", () => {
  const makeLink = async (overrides: { expired?: boolean } = {}) => {
    const customer = await ensureGuestCustomer(harness.database.db, { email: "bisi.guest@holypearls.test", name: "Bisi (TEST DATA)" });
    const [help] = await harness.database.db
      .insert(schema.helpRequests)
      .values({ reference: `HR-TEST-${Date.now()}`, customerId: customer.id, message: "Guest link target", context: { page: { path: "/", title: "Home" } } })
      .returning();
    const now = overrides.expired ? new Date(Date.now() - 200 * 86_400_000) : new Date();
    const link = await createGuestLink(harness.database.db, TEST_WEB_ORIGIN, {
      purpose: "HELP_REQUEST",
      targetType: "HELP_REQUEST",
      targetId: help!.id,
      customerId: customer.id,
      now,
    });
    return { link, helpId: help!.id };
  };

  const redeem = (secret: string) =>
    request(harness.url).post("/v1/guest-links/redeem").set("origin", TEST_WEB_ORIGIN).send({ secret });

  it("exchanges the secret for a scoped guest session and a clean URL", async () => {
    const { link, helpId } = await makeLink();
    expect(link.url).toBe(`${TEST_WEB_ORIGIN}/l#${link.secret}`);
    const response = await redeem(link.secret);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ purpose: "HELP_REQUEST", targetId: helpId, redirectTo: `/help/${helpId}` });
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    const cookie = cookieFrom(response, "hp.guest")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(response.body)).not.toContain(link.secret);

    const guest = cookie.split(";")[0]!;
    expect((await as(harness, guest).get(`/v1/help-requests/${helpId}`)).status).toBe(200);
    // Only the hash is stored, and the secret never reaches the logs.
    const [row] = await harness.database.db.select().from(schema.guestLinks).where(eq(schema.guestLinks.id, link.id));
    expect(row!.secretHash).not.toBe(link.secret);
    expect(harness.logs.join("\n")).not.toContain(link.secret);
  });

  it("refuses expired, revoked and unknown links", async () => {
    const expired = await makeLink({ expired: true });
    expect((await redeem(expired.link.secret)).body.context).toEqual({ reason: "LINK_EXPIRED" });

    const { link, helpId } = await makeLink();
    const guest = cookieFrom(await redeem(link.secret), "hp.guest")!.split(";")[0]!;
    const revoke = await as(harness, actors.adminAda!).post(`/v1/admin/guest-links/${link.id}/revoke`);
    expect(revoke.status).toBe(200);
    expect((await redeem(link.secret)).body.context).toEqual({ reason: "LINK_REVOKED" });
    // Sessions made from a revoked link stop working at once.
    expectHidden(await as(harness, guest).get(`/v1/help-requests/${helpId}`));

    expectHidden(await redeem("x".repeat(43)));
  });
});

describe("email codes (TECH-03 §5)", () => {
  const guestSession = async () => {
    const customer = await ensureGuestCustomer(harness.database.db, { email: "code.guest@holypearls.test" });
    const [help] = await harness.database.db
      .insert(schema.helpRequests)
      .values({ reference: `HR-CODE-${Date.now()}`, customerId: customer.id, message: "x", context: { page: { path: "/", title: "Home" } } })
      .returning();
    const link = await createGuestLink(harness.database.db, TEST_WEB_ORIGIN, {
      purpose: "HELP_REQUEST",
      targetType: "HELP_REQUEST",
      targetId: help!.id,
      customerId: customer.id,
    });
    const response = await request(harness.url).post("/v1/guest-links/redeem").set("origin", TEST_WEB_ORIGIN).send({ secret: link.secret });
    return cookieFrom(response, "hp.guest")!.split(";")[0]!;
  };

  const latestCode = async () => {
    await until(async () => Boolean(sender.latestTo("code.guest@holypearls.test")?.subject.match(/^\d{6}/)));
    return sender.latestTo("code.guest@holypearls.test")!.subject.slice(0, 6);
  };

  it("sends a 6-digit code, counts wrong tries and verifies the right one", async () => {
    const guest = await guestSession();
    sender.sent.length = 0;
    const sent = await as(harness, guest).post("/v1/email-codes", { purpose: "ACCEPT_QUOTE" });
    expect(sent.status).toBe(201);
    expect(sent.body.sentTo).toBe("co***@holypearls.test");
    const code = await latestCode();
    const wrong = code === "000000" ? "111111" : "000000";

    const miss = await as(harness, guest).post("/v1/email-codes/verify", { purpose: "ACCEPT_QUOTE", code: wrong });
    expect(miss.status).toBe(400);
    expect(miss.body.fieldErrors.code).toBe("That code isn't right. 4 tries left.");

    const ok = await as(harness, guest).post("/v1/email-codes/verify", { purpose: "ACCEPT_QUOTE", code });
    expect(ok.status).toBe(200);
    // The same code can't be used twice.
    expect((await as(harness, guest).post("/v1/email-codes/verify", { purpose: "ACCEPT_QUOTE", code })).body.context).toEqual({
      reason: "NO_CODE",
    });
  });

  it("locks after 5 wrong tries and expires after 10 minutes", async () => {
    const guest = await guestSession();
    sender.sent.length = 0;
    await as(harness, guest).post("/v1/email-codes", { purpose: "APPROVE_PROOF" });
    const code = await latestCode();
    const wrong = code === "000000" ? "111111" : "000000";
    let last: request.Response | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      last = await as(harness, guest).post("/v1/email-codes/verify", { purpose: "APPROVE_PROOF", code: wrong });
    }
    expect(last!.body.context).toEqual({ reason: "CODE_LOCKED" });
    expect((await as(harness, guest).post("/v1/email-codes/verify", { purpose: "APPROVE_PROOF", code })).body.context).toEqual({
      reason: "CODE_LOCKED",
    });

    sender.sent.length = 0;
    await as(harness, guest).post("/v1/email-codes", { purpose: "APPROVE_PROOF" });
    const fresh = await latestCode();
    harness.now.value = new Date(Date.now() + 11 * 60_000);
    try {
      expect((await as(harness, guest).post("/v1/email-codes/verify", { purpose: "APPROVE_PROOF", code: fresh })).body.context).toEqual({
        reason: "CODE_EXPIRED",
      });
    } finally {
      harness.now.value = null;
    }
  });

  it("requires a code within 24 hours for important actions", async () => {
    const now = new Date();
    const base = { requestId: "req_test", now };
    const guest = (emailVerifiedAt: Date | null) =>
      ({ type: "guest", ...base, guest: { guestSessionId: "g", customerId: "c", targetType: "QUOTE", targetId: "q", emailVerifiedAt } }) as const;
    await expect(requireRecentEmailCode(harness.database.db, guest(null))).rejects.toMatchObject({ code: "RECENT_EMAIL_CODE_REQUIRED" });
    await expect(requireRecentEmailCode(harness.database.db, guest(new Date(now.getTime() - 25 * 3_600_000)))).rejects.toMatchObject({
      code: "RECENT_EMAIL_CODE_REQUIRED",
    });
    await expect(requireRecentEmailCode(harness.database.db, guest(new Date(now.getTime() - 60_000)))).resolves.toBeUndefined();
  });
});

describe("email-code window per session (T01-02 follow-up)", () => {
  it("counts a code only for the session that entered it", async () => {
    const first = await harness.signInAs("customerChidi");
    const second = await harness.signInAs("customerChidi");
    const email = TEST_PEOPLE.customerChidi.email;
    const codeFor = async () => {
      await until(async () => Boolean(sender.latestTo(email)?.subject.match(/^\d{6}/)));
      return sender.latestTo(email)!.subject.slice(0, 6);
    };
    sender.sent.length = 0;
    expect((await as(harness, first).post("/v1/email-codes", { purpose: "VERIFY_ACTION" })).status).toBe(201);
    const verified = await as(harness, first).post("/v1/email-codes/verify", { purpose: "VERIFY_ACTION", code: await codeFor() });
    expect(verified.status).toBe(200);

    expect((await as(harness, first).post("/v1/demo/slice/important-action", {})).status).toBe(200);
    const other = await as(harness, second).post("/v1/demo/slice/important-action", {});
    expect(other.status).toBe(403);
    expect(other.body.code).toBe("RECENT_EMAIL_CODE_REQUIRED");
  }, 180_000);
});

describe("linking guest history to an account (TECH-03 §6)", () => {
  it("links only customer rows with the exact verified email", async () => {
    const db = harness.database.db;
    await ensureGuestCustomer(db, { email: "Link.Me@HolyPearls.test" });
    await ensureGuestCustomer(db, { email: "someone.else@holypearls.test" });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, TEST_PEOPLE.customerChidi.email));
    expect(await linkCustomersToVerifiedEmail(db, user!.id, "link.me@holypearls.test")).toBe(1);
    const [linked] = await db.select().from(schema.customers).where(eq(schema.customers.emailNormalized, "link.me@holypearls.test"));
    expect(linked!.userId).toBe(user!.id);
    const [other] = await db.select().from(schema.customers).where(eq(schema.customers.emailNormalized, "someone.else@holypearls.test"));
    expect(other!.userId).toBeNull();
  });
});

describe("help requests with context (PRD-00 §18)", () => {
  const context = {
    page: { path: "/products/polo-shirt/configure", title: "Polo Shirt configurator" },
    step: "Artwork",
    product: { id: "prod_polo", label: "Polo Shirt" },
    configuration: { id: "cfg_1", label: "Polo · 60 × Navy", summary: "left chest embroidery · ESTIMATE_READY" },
    files: [{ id: "file_1", label: "logo-lts.ai", status: "READY" }],
  };

  it("takes a guest's request with context, tells staff, and shows it only to that guest", async () => {
    sender.sent.length = 0;
    const created = await request(harness.url)
      .post("/v1/help-requests")
      .set("origin", TEST_WEB_ORIGIN)
      .send({ message: "Can you embroider a 12-colour logo?", email: "bisi.help@holypearls.test", name: "Bisi", context });
    expect(created.status).toBe(201);
    const help = helpRequestSchema.parse(created.body);
    expect(help.reference).toMatch(/^HR-\d{4}-\d{4}$/);
    expect(help.context).toEqual(context);

    const guest = cookieFrom(created, "hp.guest")!.split(";")[0]!;
    expect((await as(harness, guest).get(`/v1/help-requests/${help.id}`)).status).toBe(200);
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/help-requests/${help.id}`));
    expectHidden(await as(harness, "").get(`/v1/help-requests/${help.id}`));

    await until(async () => Boolean(sender.latestTo(TEST_HELP_INBOX)) && Boolean(sender.latestTo("bisi.help@holypearls.test")));
    expect(sender.latestTo(TEST_HELP_INBOX)!.subject).toBe(`New help request ${help.reference} · Polo Shirt · step Artwork`);
    expect(sender.latestTo("bisi.help@holypearls.test")!.subject).toBe(`We got your question (${help.reference})`);

    const inbox = helpInboxSchema.parse((await as(harness, actors.adminAda!).get("/v1/admin/help-requests?status=OPEN")).body);
    expect(inbox.entries.find((entry) => entry.id === help.id)).toMatchObject({
      requester: { name: "Bisi", email: "bisi.help@holypearls.test", kind: "guest" },
    });
    expect(inbox.counts.OPEN).toBeGreaterThanOrEqual(1);

    const replied = adminHelpRequestSchema.parse(
      (await as(harness, actors.adminAda!).post(`/v1/admin/help-requests/${help.id}/replies`, { body: "Yes — 12 colours works." })).body,
    );
    expect(replied.status).toBe("ANSWERED");
    expect(replied.replies.map((reply) => reply.body)).toEqual(["Yes — 12 colours works."]);
    await until(async () => sender.latestTo("bisi.help@holypearls.test")?.subject === `HolyPearls replied to ${help.reference}`);
    const guestView = helpRequestSchema.parse((await as(harness, guest).get(`/v1/help-requests/${help.id}`)).body);
    expect(guestView.replies).toHaveLength(1);

    const closed = await as(harness, actors.adminAda!).post(`/v1/admin/help-requests/${help.id}/close`);
    expect(closed.body.status).toBe("CLOSED");
  });

  it("uses the account's email for signed-in customers", async () => {
    const created = await as(harness, actors.customerChidi!).post("/v1/help-requests", { message: "Where is my order?", context });
    expect(created.status).toBe(201);
    const detail = adminHelpRequestSchema.parse((await as(harness, actors.adminAda!).get(`/v1/admin/help-requests/${created.body.id}`)).body);
    expect(detail.requester).toMatchObject({ email: TEST_PEOPLE.customerChidi.email, kind: "account" });
    expect((await as(harness, actors.customerChidi!).get(`/v1/help-requests/${created.body.id}`)).status).toBe(200);
  });

  it("refuses context with unexpected fields and guests without an email", async () => {
    const extra = await request(harness.url)
      .post("/v1/help-requests")
      .set("origin", TEST_WEB_ORIGIN)
      .send({ message: "Hi", email: "x@holypearls.test", context: { ...context, cardNumber: "4111" } });
    expect(extra.status).toBe(400);
    const noEmail = await request(harness.url).post("/v1/help-requests").set("origin", TEST_WEB_ORIGIN).send({ message: "Hi", context });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.fieldErrors).toEqual({ email: "Enter your email so we can reply" });
  });

  it("takes a contact-page enquiry with its type, company, phone and the sender's own files (Pen 60)", async () => {
    const db = harness.database.db;
    const [chidi] = await db.select().from(schema.users).where(eq(schema.users.email, TEST_PEOPLE.customerChidi.email));
    const [ada] = await db.select().from(schema.users).where(eq(schema.users.email, TEST_PEOPLE.adminAda.email));
    const file = async (userId: string, name: string) =>
      (
        await db
          .insert(schema.files)
          .values({ purpose: "PROJECT_ATTACHMENT", bucket: "private", storageKey: `test/${name}`, originalName: name, safeName: name, declaredType: "application/pdf", declaredSize: 1000, status: "READY", uploadedByUserId: userId })
          .returning()
      )[0]!;
    const mine = await file(chidi!.id, "brief.pdf");
    const created = await as(harness, actors.customerChidi!).post("/v1/help-requests", {
      message: "120 staff polos with our logo, needed by November",
      topic: "NEW_ORDER",
      company: "ACME Hospitality Group",
      phone: "+234 800 000 0000",
      fileIds: [mine.id],
      context: { page: { path: "/contact", title: "Contact us" } },
    });
    expect(created.status).toBe(201);
    expect(helpRequestSchema.parse(created.body)).toMatchObject({ topic: "NEW_ORDER", company: "ACME Hospitality Group", phone: "+234 800 000 0000" });
    const [attached] = await db.select().from(schema.files).where(eq(schema.files.id, mine.id));
    expect(attached).toMatchObject({ ownerType: "HELP_REQUEST", ownerId: created.body.id });
    const detail = adminHelpRequestSchema.parse((await as(harness, actors.adminAda!).get(`/v1/admin/help-requests/${created.body.id}`)).body);
    expect(detail.context.files).toEqual([{ id: mine.id, label: "brief.pdf", status: "READY" }]);

    // Someone else's file can't be attached.
    const theirs = await file(ada!.id, "not-yours.pdf");
    const refused = await as(harness, actors.customerChidi!).post("/v1/help-requests", {
      message: "Attach this",
      fileIds: [theirs.id],
      context: { page: { path: "/contact", title: "Contact us" } },
    });
    expect(refused.status).toBe(400);
    expect(refused.body.fieldErrors).toHaveProperty("fileIds");
  });

  it("keeps the inbox from customers and staff without CUSTOMER_SUPPORT", async () => {
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/help-requests"));
    expect((await as(harness, actors.adminTunde!).get("/v1/admin/help-requests")).status).toBe(403);
  });
});
