import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { S3Storage } from "./index.js";

/*
 * Files outlive the container (review P0-01). Runs against a real R2 (or
 * MinIO) bucket when its S3_* values are set, and is skipped otherwise, as
 * in CI. A fresh adapter stands in for the api after a restart or redeploy:
 * it shares nothing with the one that stored the file except the bucket.
 */

const settings = {
  endpoint: process.env.S3_ENDPOINT,
  bucket: process.env.S3_BUCKET,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
};
const configured = Object.values(settings).every(Boolean);
const adapter = () =>
  new S3Storage({
    endpoint: settings.endpoint!,
    bucket: settings.bucket!,
    accessKeyId: settings.accessKeyId!,
    secretAccessKey: settings.secretAccessKey!,
    region: process.env.S3_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });

describe.skipIf(!configured)("files in R2", () => {
  it("an upload through a signed URL is still there for a new process", async () => {
    const key = `test/persistence/${randomBytes(8).toString("hex")}.txt`;
    const body = Buffer.from(`artwork ${new Date().toISOString()}`);
    const before = adapter();
    try {
      // The browser's direct upload (TECH-04 §3).
      const put = await fetch(await before.presignUpload(key, { contentType: "text/plain", contentLength: body.length, expiresInSeconds: 60 }), {
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body,
      });
      expect(put.status).toBe(200);
      // Finalising checks the real size and inspection reads the first bytes.
      expect(await before.head(key)).toEqual({ size: body.length });
      expect((await before.readStart(key, 7)).toString()).toBe("artwork");

      // After the restart: a new client, nothing kept in memory or on disk.
      const after = adapter();
      expect((await after.read(key)).equals(body)).toBe(true);
      const download = await fetch(await after.presignDownload(key, { expiresInSeconds: 60, fileName: "artwork.txt" }));
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer()).equals(body)).toBe(true);
    } finally {
      await before.remove(key);
    }
    expect(await adapter().head(key)).toBeNull();
  }, 60_000);
});
