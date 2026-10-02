import { describe, expect, it } from "vitest";
import { renderTemplate } from "./render.js";
import { seal, unseal } from "./sealing.js";
import { MemorySender, PermanentEmailError, ResendSender } from "./senders.js";
import { TEMPLATES } from "./templates/index.js";

describe("templates", () => {
  it("render every template to HTML and plain text", async () => {
    const samples = {
      sign_in_link: { url: "https://holypearls.test/api/v1/auth/magic-link/verify?token=abc" },
      email_code: { code: "391072", purpose: "accept your quote" },
      guest_link: { url: "https://holypearls.test/l#secret", what: "quote", reference: "HP-Q-2026-0142" },
      help_request_staff: { reference: "HR-2026-0001", from: "Bisi (guest)", where: "Polo configurator", url: "https://holypearls.test/admin/help" },
      help_request_received: { reference: "HR-2026-0001", name: "Bisi" },
      help_reply: { reference: "HR-2026-0001", reply: "Yes — 12 colours works." },
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
      "email_code",
      "guest_link",
      "order_confirmed",
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
