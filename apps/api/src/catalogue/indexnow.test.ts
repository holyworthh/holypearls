import { describe, expect, it } from "vitest";
import { submitIndexNow } from "./indexnow.js";

describe("IndexNow (PUB-SEO-009)", () => {
  it("submits changed public addresses with the site's key", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const send = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    await submitIndexNow(["/resources/embroidery-or-print", "/resources/embroidery-or-print", "/products/polo-shirt"], { siteUrl: "https://holypearls.example", key: "k123" }, send);
    expect(calls[0]).toEqual({
      url: "https://api.indexnow.org/indexnow",
      body: {
        host: "holypearls.example",
        key: "k123",
        keyLocation: "https://holypearls.example/indexnow-key.txt",
        urlList: ["https://holypearls.example/resources/embroidery-or-print", "https://holypearls.example/products/polo-shirt"],
      },
    });
  });

  it("does nothing without a key (every environment but production)", async () => {
    const send = (() => {
      throw new Error("should not send");
    }) as unknown as typeof fetch;
    expect(await submitIndexNow(["/"], { siteUrl: "https://holypearls.example" }, send)).toEqual({ submitted: 0 });
  });

  it("fails so the job retries when IndexNow refuses", async () => {
    const send = (async () => new Response(null, { status: 429 })) as unknown as typeof fetch;
    await expect(submitIndexNow(["/"], { siteUrl: "https://holypearls.example", key: "k" }, send)).rejects.toThrow("429");
  });
});
