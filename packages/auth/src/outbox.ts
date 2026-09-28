import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Where sign-in emails go until real email arrives in T01-02. Magic links are
 * secrets, so they are never logged; development writes them to a local file
 * and tests keep them in memory.
 */
export interface AuthEmail {
  kind: "MAGIC_LINK";
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

/** Appends one JSON line per email to a git-ignored file for local development. */
export class FileOutbox implements AuthOutbox {
  constructor(private readonly path: string) {}

  async send(email: AuthEmail): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(email)}\n`, "utf8");
  }
}
