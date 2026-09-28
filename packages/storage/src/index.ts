import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

/**
 * Private object storage (TECH-04 §2): Cloudflare R2 in production, MinIO or
 * the local disk in development. Keys and prefixes are internal and never a
 * permission; the files module checks access before signing a URL.
 */
export interface StorageAdapter {
  /** A URL the browser can PUT exactly one object to, until it expires. */
  presignUpload(key: string, options: { contentType: string; contentLength: number; expiresInSeconds: number }): Promise<string>;
  /** A short-lived download URL (TECH-04 §6: 5 minutes; never stored or logged). */
  presignDownload(key: string, options: { expiresInSeconds: number; fileName?: string; inline?: boolean }): Promise<string>;
  /** The object's real size, or null when it doesn't exist. */
  head(key: string): Promise<{ size: number } | null>;
  /** The first `bytes` bytes, for type detection. */
  readStart(key: string, bytes: number): Promise<Buffer>;
  read(key: string): Promise<Buffer>;
  write(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface S3StorageOptions {
  endpoint: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO needs path-style URLs. */
  forcePathStyle?: boolean;
}

/** R2 (production) or MinIO (docker compose locally). */
export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region ?? "auto",
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  presignUpload(key: string, options: { contentType: string; contentLength: number; expiresInSeconds: number }) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.options.bucket, Key: key, ContentType: options.contentType, ContentLength: options.contentLength }),
      { expiresIn: options.expiresInSeconds },
    );
  }

  presignDownload(key: string, options: { expiresInSeconds: number; fileName?: string; inline?: boolean }) {
    const disposition = options.fileName
      ? `${options.inline ? "inline" : "attachment"}; filename="${options.fileName.replace(/[^\w.-]/g, "_")}"`
      : undefined;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key, ResponseContentDisposition: disposition }),
      { expiresIn: options.expiresInSeconds },
    );
  }

  async head(key: string) {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return { size: Number(result.ContentLength ?? 0) };
    } catch (error) {
      if ((error as { name?: string }).name === "NotFound") return null;
      throw error;
    }
  }

  async readStart(key: string, bytes: number) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async read(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async write(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }
}

/* Local disk storage with signed URLs served by the API, for development and tests. */

export interface LocalGrant {
  op: "put" | "get";
  key: string;
  expires: number;
  contentType?: string;
  maxBytes?: number;
  fileName?: string;
}

const encode = (grant: LocalGrant) => Buffer.from(JSON.stringify(grant)).toString("base64url");

/**
 * Stores objects under a folder. "Presigned" URLs point at the API's
 * `/v1/local-storage/:token` route, signed with HMAC like a real presigned URL.
 */
export class LocalDiskStorage implements StorageAdapter {
  constructor(
    private readonly folder: string,
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  private path(key: string) {
    const full = normalize(join(this.folder, key));
    if (!full.startsWith(normalize(this.folder) + sep)) throw new Error("Invalid storage key");
    return full;
  }

  private sign(grant: LocalGrant) {
    const body = encode(grant);
    const signature = createHmac("sha256", this.secret).update(body).digest("base64url");
    return `${this.baseUrl}/v1/local-storage/${body}.${signature}`;
  }

  /** Checks a token from the local storage route. Returns the grant, or null when it's forged or expired. */
  verify(token: string, now = Date.now()): LocalGrant | null {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = createHmac("sha256", this.secret).update(body).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const grant = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LocalGrant;
    return grant.expires > now ? grant : null;
  }

  async presignUpload(key: string, options: { contentType: string; contentLength: number; expiresInSeconds: number }) {
    return this.sign({
      op: "put",
      key,
      expires: Date.now() + options.expiresInSeconds * 1000,
      contentType: options.contentType,
      maxBytes: options.contentLength,
    });
  }

  async presignDownload(key: string, options: { expiresInSeconds: number; fileName?: string }) {
    return this.sign({ op: "get", key, expires: Date.now() + options.expiresInSeconds * 1000, fileName: options.fileName });
  }

  async head(key: string) {
    try {
      return { size: (await stat(this.path(key))).size };
    } catch {
      return null;
    }
  }

  async readStart(key: string, bytes: number) {
    return (await readFile(this.path(key))).subarray(0, bytes);
  }

  read(key: string) {
    return readFile(this.path(key));
  }

  async write(key: string, body: Buffer, _contentType?: string) {
    void _contentType;
    await mkdir(dirname(this.path(key)), { recursive: true });
    await writeFile(this.path(key), body);
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}

export interface StorageConfig {
  STORAGE_DRIVER: "local" | "s3";
  LOCAL_STORAGE_DIR: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_PUBLIC_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE: "true" | "false";
}

/**
 * The private bucket and the public-media bucket (staff product images,
 * TECH-04 §2). Local storage signs URLs for the API's /v1/local-storage route,
 * reached by the browser through `publicBaseUrl` (the web app's /api).
 */
export function createStorage(config: StorageConfig, options: { publicBaseUrl: string; signingSecret: string }) {
  if (config.STORAGE_DRIVER === "local") {
    const make = (name: string) => new LocalDiskStorage(join(config.LOCAL_STORAGE_DIR, name), options.publicBaseUrl, options.signingSecret);
    return { storage: make("private"), publicStorage: make("public-media") };
  }
  const need = (value: string | undefined, name: string) => {
    if (!value) throw new Error(`Invalid environment: ${name}`);
    return value;
  };
  const base = {
    endpoint: need(config.S3_ENDPOINT, "S3_ENDPOINT"),
    region: config.S3_REGION,
    accessKeyId: need(config.S3_ACCESS_KEY_ID, "S3_ACCESS_KEY_ID"),
    secretAccessKey: need(config.S3_SECRET_ACCESS_KEY, "S3_SECRET_ACCESS_KEY"),
    forcePathStyle: config.S3_FORCE_PATH_STYLE === "true",
  };
  return {
    storage: new S3Storage({ ...base, bucket: need(config.S3_BUCKET, "S3_BUCKET") }),
    publicStorage: new S3Storage({ ...base, bucket: need(config.S3_PUBLIC_BUCKET, "S3_PUBLIC_BUCKET") }),
  };
}
