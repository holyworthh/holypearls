import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalDiskStorage, S3Storage } from "./index.js";

const make = async () => new LocalDiskStorage(await mkdtemp(join(tmpdir(), "hp-storage-")), "http://localhost:3000/api", "secret-0123456789-0123456789-0123");

it("signs a mandatory write-once condition for direct S3 uploads", async () => {
  const storage = new S3Storage({ endpoint: "https://storage.example.test", bucket: "test", accessKeyId: "test-access", secretAccessKey: "test-secret" });
  const url = new URL(await storage.presignUpload("uploads/pending/a", { contentType: "image/png", contentLength: 10, expiresInSeconds: 60 }));
  expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain("if-none-match");
});

describe("local disk storage", () => {
  it("signs one object and one operation, and refuses forged or expired tokens", async () => {
    const storage = await make();
    const url = await storage.presignUpload("uploads/pending/a", { contentType: "image/png", contentLength: 10, expiresInSeconds: 60 });
    const token = url.split("/v1/local-storage/")[1]!;
    expect(storage.verify(token)).toMatchObject({ op: "put", key: "uploads/pending/a", maxBytes: 10 });
    expect(storage.verify(`${token}x`)).toBeNull();
    expect(storage.verify(token, Date.now() + 61_000)).toBeNull();
    const other = new LocalDiskStorage("/tmp", "http://x", "a-different-secret-0123456789-0123");
    expect(other.verify(token)).toBeNull();
  });

  it("writes, reads, measures and removes objects, and refuses keys outside its folder", async () => {
    const storage = await make();
    await storage.write("files/source/a.png", Buffer.from("hello"));
    expect(await storage.head("files/source/a.png")).toEqual({ size: 5 });
    expect((await storage.readStart("files/source/a.png", 2)).toString()).toBe("he");
    await storage.remove("files/source/a.png");
    expect(await storage.head("files/source/a.png")).toBeNull();
    await expect(storage.write("../../escape.txt", Buffer.from("x"))).rejects.toThrow("Invalid storage key");
  });
});
