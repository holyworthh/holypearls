import { type Database, sql, type Transaction } from "@holypearls/db";
import { PgBoss, type Job } from "pg-boss";
import { deadLetterName, type JobPayload, QUEUES, type QueueName, type QueueSettings, queueSettings } from "./queues.js";

/** pg-boss's database interface, running inside a Drizzle transaction. */
function executorFor(tx: Transaction | Database) {
  return {
    async executeSql(text: string, values: unknown[] = []) {
      // Turn pg's numbered placeholders ($1, $2…) into Drizzle parameters.
      const parts = text.split(/\$(\d+)/);
      const query = sql.join(
        parts.map((part, index) => (index % 2 === 0 ? sql.raw(part) : sql`${values[Number(part) - 1]}`)),
        sql.raw(""),
      );
      const result = await tx.execute(query);
      return { rows: result.rows as unknown[] };
    },
  };
}

export interface JobsOptions {
  /** A direct (unpooled) connection: pg-boss needs session features that poolers break (TECH-07 §1). */
  connectionString: string;
  /** Maximum connections pg-boss may open (TECH-07 §4). */
  maxConnections?: number;
  /** Workers run maintenance; the API only sends. */
  role: "worker" | "sender";
  /** Test override for queue settings, for example shorter retry delays. */
  settings?: Partial<Record<QueueName, Partial<QueueSettings>>>;
  onError?: (error: Error) => void;
}

export type JobHandler<Q extends QueueName> = (payload: JobPayload<Q>, job: Job<unknown>) => Promise<void>;

/** Queues jobs and runs workers with the TECH-02 §8 defaults. */
export class Jobs {
  private readonly boss: PgBoss;
  private started = false;

  constructor(private readonly options: JobsOptions) {
    this.boss = new PgBoss({
      connectionString: options.connectionString,
      max: options.maxConnections ?? 5,
      application_name: `holypearls-${options.role}`,
      supervise: options.role === "worker",
      schedule: options.role === "worker",
      // The pgboss schema comes from a migration (0023): the app's row-only role can't create schemas.
      createSchema: false,
    });
    this.boss.on("error", (error: Error) => options.onError?.(error));
  }

  private settingsFor(queue: QueueName): QueueSettings {
    return { ...queueSettings(queue), ...this.options.settings?.[queue] };
  }

  /** Starts pg-boss and creates every queue and its dead-letter queue. Safe to run on every start. */
  async start(): Promise<void> {
    if (this.started) return;
    await this.boss.start();
    for (const queue of Object.keys(QUEUES) as QueueName[]) {
      const dead = deadLetterName(queue);
      if (!(await this.boss.getQueue(dead))) await this.boss.createQueue(dead);
      const settings = { ...this.settingsFor(queue), deadLetter: dead };
      if (await this.boss.getQueue(queue)) await this.boss.updateQueue(queue, settings);
      else await this.boss.createQueue(queue, settings);
    }
    this.started = true;
  }

  /**
   * Queues a job. Pass the business change's transaction so the job exists
   * only if the change commits (TECH-00 §5, TECH-02 §8), and `startAfterSeconds`
   * to run it later.
   */
  async send<Q extends QueueName>(queue: Q, payload: JobPayload<Q>, options: { tx?: Transaction; startAfterSeconds?: number } = {}): Promise<string> {
    const data = QUEUES[queue].payload.parse(payload);
    const id = await this.boss.send(queue, data, {
      ...(options.tx ? { db: executorFor(options.tx) } : {}),
      // A business deadline gets its own job, created when the deadline is set (TECH-02 §8).
      ...(options.startAfterSeconds ? { startAfter: options.startAfterSeconds } : {}),
    });
    if (!id) throw new Error(`Job was not queued: ${queue}`);
    return id;
  }

  /** Runs a handler for one queue. Payloads are checked against their schema before the handler runs. */
  async work<Q extends QueueName>(
    queue: Q,
    handler: JobHandler<Q>,
    options: { pollingIntervalSeconds?: number; localConcurrency?: number } = {},
  ): Promise<void> {
    await this.boss.work(
      queue,
      { pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2, localConcurrency: options.localConcurrency ?? 1 },
      async (jobs: Job<unknown>[]) => {
        for (const job of jobs) await handler(QUEUES[queue].payload.parse(job.data) as JobPayload<Q>, job);
      },
    );
  }

  /** Runs a handler for jobs that used up their retries. */
  async workDeadLetters<Q extends QueueName>(
    queue: Q,
    handler: (payload: JobPayload<Q>) => Promise<void>,
    options: { pollingIntervalSeconds?: number } = {},
  ): Promise<void> {
    await this.boss.work(
      deadLetterName(queue),
      { pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2 },
      async (jobs: Job<unknown>[]) => {
        for (const job of jobs) await handler(QUEUES[queue].payload.parse(job.data) as JobPayload<Q>);
      },
    );
  }

  /** Runs a queue on a cron schedule in a time zone (housekeeping only, TECH-02 §8). */
  async schedule<Q extends QueueName>(queue: Q, cron: string, payload: JobPayload<Q>, timeZone = "Africa/Lagos"): Promise<void> {
    await this.boss.schedule(queue, cron, QUEUES[queue].payload.parse(payload), { tz: timeZone });
  }

  /** Job state for tests and the admin Jobs page. */
  async findJob(queue: string, id: string) {
    const [job] = await this.boss.findJobs(queue, { id });
    return job ?? null;
  }

  async queueSize(queue: string): Promise<number> {
    const result = await this.boss.getQueue(queue);
    return result?.queuedCount ?? 0;
  }

  /** Graceful stop: running jobs get `timeoutMs` to finish; unfinished ones retry later. */
  async stop(timeoutMs = 30_000): Promise<void> {
    if (!this.started) return;
    await this.boss.stop({ graceful: true, timeout: timeoutMs, close: true });
    this.started = false;
  }
}

/** Queues with a job that was due more than `minutes` ago and hasn't started (TECH-07 §12 backlog). */
export async function stuckQueues(db: Database, minutes: number): Promise<string[]> {
  const result = await db.execute<{ name: string }>(
    sql`select distinct name from pgboss.job where state in ('created', 'retry') and start_after < now() - make_interval(mins => ${minutes}::int)`,
  );
  return result.rows.map((row) => row.name);
}
