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
} satisfies Record<string, { payload: z.ZodType; settings: Partial<QueueSettings> }>;

export type QueueName = keyof typeof QUEUES;
export type JobPayload<Q extends QueueName> = z.infer<(typeof QUEUES)[Q]["payload"]>;

export const deadLetterName = (queue: QueueName) => `${queue}.dead`;

export const queueSettings = (queue: QueueName): QueueSettings => ({ ...JOB_DEFAULTS, ...QUEUES[queue].settings });
