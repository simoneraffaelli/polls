import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { z } from "zod";
import type { PollObservation } from "../../elections/polling/poll";
import type { ArticleObservation } from "../../platform/data/article";
import type {
  CollectionDestination,
  SourceAdapter,
} from "../../platform/collection/contracts";
import { collectOnePage } from "../../platform/collection/collect-page";
import { CollectionError } from "../../platform/collection/errors";
import type { Database } from "../database/client";
import { createArticleCollectionPageStore } from "../database/article-repository";
import {
  beginCollectionRun,
  assertCollectionSourceEnabled,
  createPollCollectionPageStore,
  loadCollectionRun,
  MAX_CYCLE_MS,
  MAX_PAGES_PER_CYCLE,
} from "../database/collection-repository";
import { collectionRuns, sourceCursors } from "../database/schema";

export const COLLECTION_QUEUE = "collect-source-page";
export const MODEL_QUEUE = "run-baseline-model";
export const QUEUE_SCHEMA = "polls_jobs";
const RETRY_LIMIT = 3;
const MAX_DEFERRED_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const jobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), runId: z.uuid() }),
  z.object({ kind: z.literal("start"), sourceId: z.uuid() }),
]);

export type PollSourceRegistration = {
  adapter: SourceAdapter<PollObservation>;
  destinations: readonly CollectionDestination[];
  schedule?: { cron: string };
};
export type PollSourceRegistry = ReadonlyMap<string, PollSourceRegistration>;
export type ArticleSourceRegistration = {
  family: "articles";
  adapter: SourceAdapter<ArticleObservation>;
  destinations: readonly CollectionDestination[];
  schedule?: { cron: string };
};
export type CollectionSourceRegistration =
  (PollSourceRegistration & { family: "polls" }) | ArticleSourceRegistration;
export type CollectionSourceRegistry = ReadonlyMap<
  string,
  CollectionSourceRegistration
>;

function newBoss(
  connectionString: string,
  install: boolean,
  schema = QUEUE_SCHEMA,
  publisher = false,
): PgBoss {
  return new PgBoss({
    connectionString,
    schema,
    migrate: install,
    createSchema: install,
    max: 2,
    schedule: !install && !publisher,
    supervise: !publisher,
    persistQueueStats: false,
  });
}

/** Called once per release, before workers start. */
export async function installCollectionQueue(
  connectionString: string,
  schema = QUEUE_SCHEMA,
): Promise<void> {
  const boss = newBoss(connectionString, true, schema);
  boss.on("error", () => {
    /* CLI reports failure without connection details. */
  });
  try {
    await boss.start();
    await boss.createQueue(COLLECTION_QUEUE, {
      policy: "standard",
      retryLimit: RETRY_LIMIT,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 60,
      expireInSeconds: 300,
      retentionSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(MODEL_QUEUE, {
      policy: "standard",
      retryLimit: 2,
      retryDelay: 10,
      retryBackoff: true,
      retryDelayMax: 120,
      expireInSeconds: 600,
      retentionSeconds: 7 * 24 * 60 * 60,
    });
  } finally {
    await boss.stop({ graceful: true, timeout: 30_000 });
  }
}

/** Runtime never creates or migrates queue tables. */
export async function startCollectionQueue(
  connectionString: string,
  schema = QUEUE_SCHEMA,
): Promise<PgBoss> {
  const boss = newBoss(connectionString, false, schema);
  boss.on("error", () => console.error("Collection queue connection error"));
  await boss.start({ attempts: 3 });
  return boss;
}

/** Brief admin publisher connection; the worker still owns job execution. */
export async function publishAdminCollectionRun(
  db: Database,
  connectionString: string,
  sourceId: string,
): Promise<string> {
  const boss = newBoss(connectionString, false, QUEUE_SCHEMA, true);
  boss.on("error", () => {
    /* The caller receives a generic failure. */
  });
  try {
    await boss.start({ attempts: 2 });
    return await enqueueCollectionRun(db, boss, sourceId);
  } finally {
    await boss.stop({ graceful: true, timeout: 10_000 });
  }
}

async function updateRunError(
  db: Database,
  runId: string,
  code: string,
  terminal: boolean,
): Promise<void> {
  await db
    .update(collectionRuns)
    .set({
      errorCode: code,
      ...(terminal
        ? { status: "failed", completedAt: sql`clock_timestamp()` }
        : {}),
    })
    .where(
      and(eq(collectionRuns.id, runId), eq(collectionRuns.status, "running")),
    );
}

async function ensureQueued(
  db: Database,
  boss: PgBoss,
  runId: string,
): Promise<void> {
  const [run] = await db
    .select()
    .from(collectionRuns)
    .where(eq(collectionRuns.id, runId));
  if (!run || run.status !== "running") return;
  const [cursor] = await db
    .select({
      notBefore: sourceCursors.notBefore,
      blockedReasonCode: sourceCursors.blockedReasonCode,
    })
    .from(sourceCursors)
    .where(eq(sourceCursors.sourceId, run.sourceId));
  if (cursor?.blockedReasonCode) {
    await updateRunError(db, runId, cursor.blockedReasonCode, true);
    return;
  }
  const jobId = run.queueJobId ?? run.id;
  const existing = await boss.findJobs(COLLECTION_QUEUE, {
    id: jobId,
    limit: 1,
  });
  if (existing.length > 0) {
    if (
      existing[0].state === "failed" ||
      existing[0].state === "cancelled" ||
      existing[0].state === "completed"
    ) {
      await updateRunError(db, runId, "queue_terminal_without_commit", true);
    }
    return;
  }
  const startAfter = [run.retryNotBefore, cursor?.notBefore]
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const queued = await boss.send(
    COLLECTION_QUEUE,
    { kind: "page", runId },
    {
      id: jobId,
      singletonKey: run.sourceId,
      ...(startAfter ? { startAfter } : {}),
    },
  );
  if (!queued) throw new Error("Collection job could not be queued");
}

export async function enqueueCollectionRun(
  db: Database,
  boss: PgBoss,
  sourceId: string,
  continuationRunId?: string,
): Promise<string> {
  const run = await beginCollectionRun(db, sourceId, continuationRunId);
  try {
    await ensureQueued(db, boss, run.runId);
  } catch {
    // An ambiguous queue acknowledgement is recovered from the durable run at worker startup.
    await updateRunError(db, run.runId, "enqueue_unconfirmed", false);
    throw new Error("Collection job enqueue unconfirmed");
  }
  return run.runId;
}

/** Repair a crash between creating a durable run and queueing its job. */
export async function reconcileCollectionRuns(
  db: Database,
  boss: PgBoss,
): Promise<void> {
  const pending = await db
    .select({ id: collectionRuns.id, sourceId: collectionRuns.sourceId })
    .from(collectionRuns)
    .where(eq(collectionRuns.status, "running"));
  for (const run of pending) await ensureQueued(db, boss, run.id);
  const cursors = await db
    .select({ lastRunId: sourceCursors.lastRunId })
    .from(sourceCursors);
  for (const cursor of cursors) {
    if (cursor.lastRunId) await enqueueNextPage(db, boss, cursor.lastRunId);
  }
}

async function enqueueNextPage(
  db: Database,
  boss: PgBoss,
  completedRunId: string,
): Promise<void> {
  const [prior] = await db
    .select()
    .from(collectionRuns)
    .where(eq(collectionRuns.id, completedRunId));
  if (
    !prior ||
    prior.status !== "succeeded" ||
    !prior.hasMore ||
    prior.pageIndex + 1 >= MAX_PAGES_PER_CYCLE ||
    Date.now() - prior.cycleStartedAt.getTime() >= MAX_CYCLE_MS
  )
    return;
  try {
    await enqueueCollectionRun(db, boss, prior.sourceId, prior.id);
  } catch (error) {
    if (
      error instanceof CollectionError &&
      (error.code === "source_disabled" || error.code === "budget")
    )
      return;
    throw error;
  }
}

async function deferForRetryAfter(
  db: Database,
  boss: PgBoss,
  runId: string,
  delayMs: number,
): Promise<boolean> {
  const valid = Number.isSafeInteger(Math.ceil(delayMs)) && delayMs >= 0;
  const representable = valid && delayMs <= 365 * 24 * 60 * 60 * 1000;
  const deferred = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM collection_runs WHERE id = ${runId} FOR UPDATE`,
    );
    const [run] = await tx
      .select()
      .from(collectionRuns)
      .where(eq(collectionRuns.id, runId));
    if (!run || run.status !== "running") return false;
    await tx.execute(
      sql`SELECT source_id FROM source_cursors WHERE source_id = ${run.sourceId} FOR UPDATE`,
    );
    if (representable) {
      await tx
        .update(sourceCursors)
        .set({
          notBefore: sql`GREATEST(COALESCE(${sourceCursors.notBefore}, clock_timestamp()), clock_timestamp() + (${Math.ceil(delayMs)} * interval '1 millisecond'))`,
        })
        .where(eq(sourceCursors.sourceId, run.sourceId));
    } else {
      await tx
        .update(sourceCursors)
        .set({ blockedReasonCode: "retry_after_out_of_range" })
        .where(eq(sourceCursors.sourceId, run.sourceId));
    }
    if (
      !representable ||
      delayMs > MAX_RETRY_AFTER_MS ||
      run.attemptCount >= MAX_DEFERRED_ATTEMPTS
    ) {
      await tx
        .update(collectionRuns)
        .set({
          status: "failed",
          errorCode: "rate_limited",
          completedAt: sql`clock_timestamp()`,
        })
        .where(eq(collectionRuns.id, runId));
      return false;
    }
    await tx
      .update(collectionRuns)
      .set({
        queueJobId: randomUUID(),
        retryNotBefore: sql`clock_timestamp() + (${Math.ceil(delayMs)} * interval '1 millisecond')`,
        attemptCount: run.attemptCount + 1,
        errorCode: "rate_limited",
      })
      .where(eq(collectionRuns.id, runId));
    return true;
  });
  if (deferred) await ensureQueued(db, boss, runId);
  return deferred;
}

/** Only explicitly registered sources receive schedules; stale registrations are removed. */
export async function syncPollCollectionSchedules(
  boss: PgBoss,
  registry: ReadonlyMap<string, { schedule?: { cron: string } }>,
): Promise<void> {
  const existing = await boss.getSchedules(COLLECTION_QUEUE);
  for (const schedule of existing) {
    if (!registry.get(schedule.key)?.schedule)
      await boss.unschedule(COLLECTION_QUEUE, schedule.key);
  }
  for (const [sourceId, registration] of registry) {
    if (!registration.schedule) continue;
    await boss.schedule(
      COLLECTION_QUEUE,
      registration.schedule.cron,
      { kind: "start", sourceId },
      { key: sourceId, tz: "UTC", missed: "once", singletonKey: sourceId },
    );
  }
}

export async function registerPollCollectionWorker(
  db: Database,
  boss: PgBoss,
  registry: PollSourceRegistry | CollectionSourceRegistry,
  resolveSource?: (
    sourceId: string,
  ) => Promise<CollectionSourceRegistration | undefined>,
): Promise<void> {
  const pollStore = createPollCollectionPageStore(db);
  const articleStore = createArticleCollectionPageStore(db);
  await boss.work<z.infer<typeof jobSchema>>(
    COLLECTION_QUEUE,
    {
      batchSize: 1,
      localConcurrency: 1,
      includeMetadata: true,
      perJobResults: true,
    },
    async ([job]) => {
      if (!job) return [];
      const parsed = jobSchema.safeParse(job.data);
      if (!parsed.success)
        return [
          { id: job.id, status: "deadletter", output: { code: "invalid_job" } },
        ];
      if (parsed.data.kind === "start") {
        try {
          if (
            !registry.has(parsed.data.sourceId) &&
            !(await resolveSource?.(parsed.data.sourceId))
          )
            throw new CollectionError(
              "source_disabled",
              "Source is not registered",
            );
          await enqueueCollectionRun(db, boss, parsed.data.sourceId);
          return [{ id: job.id, status: "completed" }];
        } catch (error) {
          const code =
            error instanceof CollectionError ? error.code : "internal";
          const terminal = error instanceof CollectionError && !error.retryable;
          return [
            {
              id: job.id,
              status: terminal ? "deadletter" : "failed",
              output: { code },
            },
          ];
        }
      }
      const runId = parsed.data.runId;
      try {
        const run = await loadCollectionRun(db, runId);
        const [stored] = await db
          .select({
            status: collectionRuns.status,
            queueJobId: collectionRuns.queueJobId,
            blocked: sql<boolean>`retry_not_before IS NOT NULL AND clock_timestamp() < retry_not_before`,
          })
          .from(collectionRuns)
          .where(eq(collectionRuns.id, runId));
        if (!stored || stored.status === "failed")
          throw new CollectionError("schema", "Collection run is not active");
        if (stored.queueJobId && stored.queueJobId !== job.id) {
          await ensureQueued(db, boss, runId);
          return [{ id: job.id, status: "completed" }];
        }
        if (stored.blocked) {
          await ensureQueued(db, boss, runId);
          return [
            { id: job.id, status: "failed", output: { code: "rate_limited" } },
          ];
        }
        const source =
          registry.get(run.sourceId) ?? (await resolveSource?.(run.sourceId));
        if (!source)
          throw new CollectionError(
            "source_disabled",
            "Unconfigured collection source",
          );
        if (stored.status !== "succeeded")
          await assertCollectionSourceEnabled(db, run.sourceId);
        if ("family" in source && source.family === "articles") {
          await collectOnePage({
            adapter: source.adapter,
            store: articleStore,
            run,
            destinations: source.destinations,
            signal: job.signal,
            maxObservationsPerPage: 500,
          });
        } else {
          if (source.adapter.family !== "polls")
            throw new CollectionError(
              "schema",
              "Collection adapter family is invalid",
            );
          await collectOnePage({
            adapter: source.adapter as SourceAdapter<PollObservation>,
            store: pollStore,
            run,
            destinations: source.destinations,
            signal: job.signal,
            maxObservationsPerPage: 500,
          });
        }
        await enqueueNextPage(db, boss, runId);
        return [{ id: job.id, status: "completed" }];
      } catch (error) {
        const code = error instanceof CollectionError ? error.code : "internal";
        if (
          error instanceof CollectionError &&
          error.retryable &&
          error.retryAfterMs !== null
        ) {
          if (await deferForRetryAfter(db, boss, runId, error.retryAfterMs)) {
            return [
              { id: job.id, status: "completed", output: { code: "deferred" } },
            ];
          }
          return [
            {
              id: job.id,
              status: "deadletter",
              output: { code: "rate_limited" },
            },
          ];
        }
        const terminal =
          (error instanceof CollectionError &&
            !error.retryable &&
            error.code !== "aborted") ||
          job.retryCount >= RETRY_LIMIT;
        await updateRunError(db, runId, code, terminal);
        return [
          {
            id: job.id,
            status: terminal ? "deadletter" : "failed",
            output: { code },
          },
        ];
      }
    },
  );
}

export const registerCollectionWorker = registerPollCollectionWorker;
