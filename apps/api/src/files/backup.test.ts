import { loadTestDatabaseEnv } from "@holypearls/config";
import { schema } from "@holypearls/db";
import { LocalDiskStorage } from "@holypearls/storage";
import { createTestDatabase, type TestDatabase } from "@holypearls/testkit";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { backupFiles } from "./files.js";

/* T15-05: the daily copy of private files to the backup bucket (TECH-07 §5). */

vi.setConfig({ testTimeout: 120_000 });

let database: TestDatabase;
let storage: LocalDiskStorage;
let publicStorage: LocalDiskStorage;
let backupStorage: LocalDiskStorage;

beforeAll(async () => {
  database = await createTestDatabase(loadTestDatabaseEnv().TEST_DATABASE_URL);
  const dir = await mkdtemp(join(tmpdir(), "hp-backup-"));
  const make = (name: string) => new LocalDiskStorage(join(dir, name), "http://localhost/api", "backup-test-seal-key-0123456789abcdef");
  [storage, publicStorage, backupStorage] = [make("private"), make("public"), make("backup")];
});

afterAll(async () => {
  await database?.drop();
});

async function addFile(bucket: "private" | "public-media", status: "READY" | "PENDING_UPLOAD", body: string) {
  const key = `backup-test/${randomUUID()}`;
  await (bucket === "private" ? storage : publicStorage).write(key, Buffer.from(body), "text/plain");
  await database.db.insert(schema.files).values({ purpose: "ARTWORK", status, bucket, originalName: "a.txt", safeName: "a.txt", declaredType: "text/plain", declaredSize: body.length, storageKey: key });
  return key;
}

describe("backupFiles", () => {
  it("copies ready private files once, and ignores the public bucket and unfinished uploads", async () => {
    const ready = await addFile("private", "READY", "hello");
    const pending = await addFile("private", "PENDING_UPLOAD", "not yet");
    const media = await addFile("public-media", "READY", "public");
    const deps = { db: database.db, storage, backupStorage };
    const since = new Date(Date.now() - 86_400_000);

    expect(await backupFiles(deps, since)).toBe(1);
    expect((await backupStorage.read(ready)).toString()).toBe("hello");
    expect(await backupStorage.head(pending)).toBeNull();
    expect(await backupStorage.head(media)).toBeNull();
    // Already copied at the same size: nothing to do.
    expect(await backupFiles(deps, since)).toBe(0);
    // A file changed since the copy is copied again.
    await storage.write(ready, Buffer.from("hello again"), "text/plain");
    expect(await backupFiles(deps, since)).toBe(1);
    expect((await backupStorage.read(ready)).toString()).toBe("hello again");
  });
});
