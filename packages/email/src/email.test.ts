import { describe, expect, it } from "vitest";
import { renderTemplate } from "./render.js";
import { seal, unseal } from "./sealing.js";
import { MemorySender, PermanentEmailError, ResendSender } from "./senders.js";
import { TEMPLATES } from "./templates/index.js";

describe("templates", () => {
  it("render every template to HTML and plain text", async () => {
    const samples = {
      sign_in_link: { url: "https://holypearls.test/api/v1/auth/magic-link/verify?token=abc" },
      verify_email: { url: "https://holypearls.test/api/v1/auth/verify-email?token=abc" },
      change_email: { url: "https://holypearls.test/api/v1/auth/verify-email?token=abc" },
      password_reset: { url: "https://holypearls.test/api/v1/auth/reset-password/abc?callbackURL=%2Freset-password" },
      email_code: { code: "391072", purpose: "accept your quote" },
      guest_link: { url: "https://holypearls.test/l#secret", what: "quote", reference: "HP-Q-2026-0142" },
      help_request_staff: { reference: "HR-2026-0001", from: "Bisi (guest)", where: "Polo configurator", url: "https://holypearls.test/admin/help" },
      help_request_received: { reference: "HR-2026-0001", name: "Bisi" },
      help_reply: { reference: "HR-2026-0001", reply: "Yes — 12 colours works." },
      organization_invitation: { organization: "ACME", role: "Buyer", invitedBy: "Ada", expires: "15 October 2026", url: "https://holypearls.test/invitations#abc" },
      organization_role_changed: { organization: "ACME", role: "Approver", url: "https://holypearls.test/workspace" },
      organization_request_staff: { company: "ACME", locations: 2, url: "https://admin.holypearls.test/organization-requests" },
      organization_request_approved: { organization: "ACME", url: "https://holypearls.test/workspace" },
      organization_request_declined: { company: "ACME", reason: "We couldn't confirm the company details." },
      brand_asset_reviewed: { asset: "Primary Logo V5", kind: "Logo", ready: false, note: "Colour count is 14.", url: "https://holypearls.test/workspace/x/assets/y" },
      order_request_submitted: { title: "Staff Polo — Navy × 24", requestedBy: "Tunde O.", location: "Lekki", amount: "₦450,000.00", url: "https://holypearls.test/workspace/x/approvals/y" },
      order_request_decided: { title: "Staff Polo — Navy × 24", decision: "CHANGES_REQUESTED", decidedBy: "Bola M.", note: "Make it 20.", url: "https://holypearls.test/workspace/x/approvals/y" },
      collection_submitted: { collection: "2027 Staff Uniforms", organization: "ACME", summary: ["Size: M", "Name: ADAEZE", "Branch: Lekki"], deadline: "12 Oct" },
      test_email: { requestedBy: "Ada" },
    } as const;
    for (const [name, data] of Object.entries(samples)) {
      const email = await renderTemplate(name as keyof typeof TEMPLATES, data as never);
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.html).toContain("<html");
      expect(email.html).toContain("HolyPearls");
      expect(email.text).toContain("HolyPearls will never ask for your password");
    }
    const code = await renderTemplate("email_code", samples.email_code);
    expect(code.subject).toBe("391072 is your HolyPearls code");
    expect(code.text).toContain("391072");
  });

  it("refuse data that doesn't match the template", async () => {
    await expect(renderTemplate("email_code", { code: "12", purpose: "x" })).rejects.toThrow();
  });

  it("mark every template that carries a secret", () => {
    expect(Object.entries(TEMPLATES).filter(([, t]) => t.carriesSecret).map(([name]) => name)).toEqual([
      "sign_in_link",
      "verify_email",
      "change_email",
      "password_reset",
      "email_code",
      "guest_link",
      "order_confirmed",
      "project_submitted",
      "quote_ready",
      "quote_expiring",
      "quote_accepted",
      "payment_due",
      "payment_received",
      "proof_ready",
      "item_on_hold",
      "hold_resolved",
      "order_link",
      "order_cancelled",
      "shipment_dispatched",
      "shipment_delivered",
      "problem_received",
      "problem_reply",
      "organization_invitation",
    ]);
  });
});

describe("sealing", () => {
  it("round-trips data and refuses the wrong key", () => {
    const sealed = seal({ code: "123456" }, "key-one-0123456789-0123456789-01");
    expect(sealed).not.toContain("123456");
    expect(unseal(sealed, "key-one-0123456789-0123456789-01")).toEqual({ code: "123456" });
    expect(() => unseal(sealed, "key-two-0123456789-0123456789-01")).toThrow();
  });
});

describe("senders", () => {
  it("treat Resend 4xx as permanent and 5xx as retryable", async () => {
    const email = { to: "a@holypearls.test", subject: "s", html: "<p>h</p>", text: "t", idempotencyKey: "n1" };
    const reply = (status: number) => async () => new Response(JSON.stringify({ name: "error" }), { status });
    await expect(new ResendSender("k", "f", reply(422)).send(email)).rejects.toBeInstanceOf(PermanentEmailError);
    await expect(new ResendSender("k", "f", reply(503)).send(email)).rejects.not.toBeInstanceOf(PermanentEmailError);
    const ok = new ResendSender("k", "f", async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    await expect(ok.send(email)).resolves.toEqual({ providerMessageId: "re_1" });
  });

  it("memory sender can simulate failures", async () => {
    const sender = new MemorySender();
    sender.failNext = 1;
    const email = { to: "a@holypearls.test", subject: "s", html: "h", text: "t", idempotencyKey: "n1" };
    await expect(sender.send(email)).rejects.toThrow("550");
    await expect(sender.send(email)).resolves.toEqual({ providerMessageId: "memory-1" });
  });
});
