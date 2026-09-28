import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, isSensitiveKey, REDACTED } from "./logger.js";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { lines, logger: createLogger({ destination, environment: "test" }) };
}

describe("log redaction", () => {
  it("never writes secrets, tokens or personal data", () => {
    const { lines, logger } = capture();
    logger.info(
      {
        requestId: "req_1",
        customerId: "cus_1",
        headers: { authorization: "Bearer sk_live_abc", cookie: "session=s3cr3t", "x-api-key": "key-123" },
        body: {
          email: "ada@example.com",
          password: "hunter2",
          guestLink: { secret: "gl_secret_value", accessToken: "tok_value" },
          attempts: [{ otp: "123456" }],
          phone: "+2348000000000",
        },
        paystack_secret_key: "sk_test_xyz",
      },
      "sign-in attempt",
    );

    const output = lines.join("");
    for (const value of [
      "sk_live_abc",
      "s3cr3t",
      "key-123",
      "ada@example.com",
      "hunter2",
      "gl_secret_value",
      "tok_value",
      "123456",
      "+2348000000000",
      "sk_test_xyz",
    ]) {
      expect(output).not.toContain(value);
    }
    const line = JSON.parse(output);
    expect(line.body.password).toBe(REDACTED);
    expect(line.customerId).toBe("cus_1");
    expect(line.requestId).toBe("req_1");
  });

  it("keeps error codes and IDs, which are not secret", () => {
    expect(isSensitiveKey("code")).toBe(false);
    expect(isSensitiveKey("requestId")).toBe(false);
    expect(isSensitiveKey("customerId")).toBe(false);
    expect(isSensitiveKey("refresh_token")).toBe(true);
    expect(isSensitiveKey("Set-Cookie")).toBe(true);
  });
});
