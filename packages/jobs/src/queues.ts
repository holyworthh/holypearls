import { z } from "zod";

/**
 * Default settings for every job (TECH-02 §8): 5 retries, backoff starting
 * at 30 seconds and doubling, a 5-minute timeout, then the dead-letter queue.
 */
export const JOB_DEFAULTS = {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 5 * 60,
} as const;

export interface QueueSettings {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
  expireInSeconds: number;
}

/** Every payload carries a schema version and the request ID; the rest is resource IDs (TECH-02 §8). */
const payload = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ v: z.literal(1), requestId: z.string().min(1), ...shape }).strict();

/**
 * Queues and their payloads. Tickets add their queue here, with only the
 * settings that differ from JOB_DEFAULTS (TECH-02 §8 table).
 */
export const QUEUES = {
  /** T00-04 end-to-end slice: web → API → database → job → result. */
  "demo.slice": { payload: payload({ demoId: z.string().uuid() }), settings: {} },
  /** Sends one notification through EmailSender (TECH-02 §8: 8 retries). */
  "email.send": { payload: payload({ notificationId: z.string().uuid() }), settings: { retryLimit: 8 } },
  /** Checks the real type and size of an upload (2-minute timeout). */
  "file.inspect": { payload: payload({ fileId: z.string().uuid() }), settings: { expireInSeconds: 120 } },
  /** Makes previews and thumbnails (2 retries, 2-minute timeout). */
  "file.preview": { payload: payload({ fileId: z.string().uuid() }), settings: { retryLimit: 2, expireInSeconds: 120 } },
  /** Tells the web app to refresh cached public pages for these cache tags (TECH-02 §6). */
  "cache.revalidate": { payload: payload({ tags: z.array(z.string().max(120)).min(1).max(50) }), settings: { retryLimit: 3 } },
  /** Rebuilds the search index from published records after catalogue or content changes (TECH-02 §8: 3 retries). */
  "search.refresh": { payload: payload({}), settings: { retryLimit: 3 } },
  /** Tells search engines which public addresses changed (IndexNow, PUB-SEO-009). */
  "seo.indexnow": { payload: payload({ paths: z.array(z.string().startsWith("/").max(300)).min(1).max(100) }), settings: { retryLimit: 3 } },
  /**
   * Asks Paystack for the final result of an unclear attempt. One job per check in the TECH-05 §6
   * schedule, queued when the attempt starts; `check` is its place in that schedule.
   */
  "payment.check": { payload: payload({ attemptId: z.string().uuid(), check: z.number().int().min(1).max(20) }), settings: {} },
  /** Follows up a saved Paystack webhook: confirms with the verify API before changing anything (TECH-02 §9). */
  "payment.verify": { payload: payload({ eventId: z.string().uuid() }), settings: {} },
  /** Expires a sent quote version at its valid-until time (TECH-02 §8), queued when the version is sent. */
  "quote.expire": { payload: payload({ quoteVersionId: z.string().uuid() }), settings: {} },
  /** A reminder due at a set time: quote expiring, balance due (TECH-02 §8). Checked again when it runs. */
  "reminder.send": { payload: payload({ kind: z.enum(["QUOTE_EXPIRING"]), recordId: z.string().uuid() }), settings: {} },
  /** Housekeeping at 03:00 WAT: unattached uploads, expired links and codes, old keys and counters. */
  "cleanup.daily": { payload: payload({}), settings: {} },
} satisfies Record<string, { payload: z.ZodType; settings: Partial<QueueSettings> }>;

export type QueueName = keyof typeof QUEUES;
export type JobPayload<Q extends QueueName> = z.infer<(typeof QUEUES)[Q]["payload"]>;

export const deadLetterName = (queue: QueueName) => `${queue}.dead`;

export const queueSettings = (queue: QueueName): QueueSettings => ({ ...JOB_DEFAULTS, ...QUEUES[queue].settings });
