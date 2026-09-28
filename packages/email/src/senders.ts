import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";
import type { RenderedEmail } from "./render.js";

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  /** Our notification ID, so a provider retry can't send the same email twice. */
  idempotencyKey: string;
}

export interface SendResult {
  providerMessageId: string;
}

/** The only way HolyPearls sends email (TECH-02 §10). Controllers never call it; the email.send job does. */
export interface EmailSender {
  readonly name: string;
  send(email: OutgoingEmail): Promise<SendResult>;
}

/** Thrown for failures a retry won't fix (for example a rejected address); the job fails at once. */
export class PermanentEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentEmailError";
  }
}

/** Resend's HTTP API (staging and production). */
export class ResendSender implements EmailSender {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(email: OutgoingEmail): Promise<SendResult> {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": email.idempotencyKey,
      },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!response.ok) {
      const message = `Resend ${response.status}: ${body.name ?? body.message ?? "error"}`;
      // 4xx other than rate limiting won't succeed on retry.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) throw new PermanentEmailError(message);
      throw new Error(message);
    }
    return { providerMessageId: body.id ?? "unknown" };
  }
}

/** SMTP, for Mailpit locally (docker compose: port 1025, inbox at http://localhost:8025). */
export class SmtpSender implements EmailSender {
  readonly name = "smtp";
  private readonly transport;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const info = await this.transport.sendMail({
      from: this.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      messageId: `<${email.idempotencyKey}@holypearls.local>`,
    });
    return { providerMessageId: info.messageId };
  }
}

/** Writes each email to a git-ignored folder, for machines without Mailpit. */
export class FileSender implements EmailSender {
  readonly name = "file";

  constructor(private readonly folder: string) {}

  async send(email: OutgoingEmail): Promise<SendResult> {
    await mkdir(this.folder, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${email.idempotencyKey}`;
    await writeFile(join(this.folder, `${name}.html`), email.html, "utf8");
    await writeFile(join(this.folder, `${name}.txt`), `To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}`, "utf8");
    return { providerMessageId: `file:${name}` };
  }
}

/** Keeps emails in memory, for tests. `failNext` makes the next sends throw. */
export class MemorySender implements EmailSender {
  readonly name = "memory";
  readonly sent: OutgoingEmail[] = [];
  failNext = 0;

  async send(email: OutgoingEmail): Promise<SendResult> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("Mailbox unavailable (550)");
    }
    this.sent.push(email);
    return { providerMessageId: `memory-${this.sent.length}` };
  }

  latestTo(to: string) {
    return this.sent.filter((email) => email.to === to).at(-1);
  }
}

export interface EmailSenderConfig {
  EMAIL_TRANSPORT: "resend" | "smtp" | "file";
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
  SMTP_URL?: string;
  EMAIL_FILE_DIR: string;
}

export function createEmailSender(config: EmailSenderConfig): EmailSender {
  if (config.EMAIL_TRANSPORT === "resend") {
    if (!config.RESEND_API_KEY) throw new Error("Invalid environment: RESEND_API_KEY");
    return new ResendSender(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  if (config.EMAIL_TRANSPORT === "smtp") return new SmtpSender(config.SMTP_URL ?? "smtp://localhost:1025", config.EMAIL_FROM);
  return new FileSender(config.EMAIL_FILE_DIR);
}
