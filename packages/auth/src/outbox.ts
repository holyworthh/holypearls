/**
 * Where the sign-in library's emails go. The API passes one that queues a
 * notification (email.send); tests keep them in memory. Magic links are
 * secrets, so they are never logged.
 */
export interface AuthEmail {
  /** A sign-in link, an email check after sign-up, or a password reset link. */
  kind: "MAGIC_LINK" | "VERIFY_EMAIL" | "PASSWORD_RESET";
  to: string;
  url: string;
  sentAt: Date;
}

export interface AuthOutbox {
  send(email: AuthEmail): Promise<void>;
}

export class MemoryOutbox implements AuthOutbox {
  readonly sent: AuthEmail[] = [];

  async send(email: AuthEmail): Promise<void> {
    this.sent.push(email);
  }

  /** Newest email to one address. */
  latestTo(to: string): AuthEmail | undefined {
    return this.sent.filter((email) => email.to === to.toLowerCase()).at(-1);
  }
}
