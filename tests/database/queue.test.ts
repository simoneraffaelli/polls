import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CollectionError } from "../../src/platform/collection/errors";
import {
  enqueueCollectionRun,
  installCollectionQueue,
  reconcileCollectionRuns,
  registerPollCollectionWorker,
  startCollectionQueue,
} from "../../src/infrastructure/jobs/collection-queue";
import {
  collectionRuns,
  configuredSources,
  sourceSectionBindings,
  sourceCursors,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  seedDatabase,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe("durable collection queue on PostgreSQL", () => {
  let database: IsolatedDatabase;
  let sourceId: string;
  let control: pg.Pool;
  let boss: Awaited<ReturnType<typeof startCollectionQueue>> | undefined;
  const queueSchema = `polls_test_jobs_${randomBytes(8).toString("hex")}`;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    ({ sourceId } = await seedDatabase(database));
    await database.db
      .insert(sourceSectionBindings)
      .values({ sourceId, sectionId: us2026.sectionId, enabled: true });
    const connectionString = process.env.TEST_DATABASE_URL!;
    control = new pg.Pool({ connectionString, max: 1 });
    await installCollectionQueue(connectionString, queueSchema);
  }, 30_000);

  afterAll(async () => {
    if (boss) await boss.stop({ graceful: true, timeout: 30_000 });
    if (control) {
      await control.query(`DROP SCHEMA IF EXISTS "${queueSchema}" CASCADE`);
      await control.end();
    }
    if (database) await database.cleanup();
  }, 30_000);

  async function awaitStatus(
    runId: string,
    status: string,
    timeoutMs = 25_000,
  ) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const [run] = await database.db
        .select()
        .from(collectionRuns)
        .where(eq(collectionRuns.id, runId));
      if (run?.status === status) return run;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Collection run did not reach ${status}`);
  }

  it("resumes a queued page after restart and retries a transient provider error", async () => {
    const connectionString = process.env.TEST_DATABASE_URL!;
    boss = await startCollectionQueue(connectionString, queueSchema);
    const runId = await enqueueCollectionRun(database.db, boss, sourceId);
    await boss.stop({ graceful: true, timeout: 30_000 });
    boss = await startCollectionQueue(connectionString, queueSchema);
    let attempts = 0;
    await registerPollCollectionWorker(
      database.db,
      boss,
      new Map([
        [
          sourceId,
          {
            destinations: [{ scope: us2026, raceId: null }],
            adapter: {
              family: "polls" as const,
              parserVersion: "test-parser-1",
              async fetchPage() {
                attempts++;
                if (attempts === 1)
                  throw new CollectionError(
                    "network",
                    "Transient fixture failure",
                    { retryable: true },
                  );
                return {
                  observations: [],
                  quarantined: [],
                  nextCursor: null,
                  hasMore: false,
                  acquiredAt: new Date().toISOString(),
                };
              },
            },
          },
        ],
      ]),
    );
    const run = await awaitStatus(runId, "succeeded");
    expect(run.savedCount).toBe(0);
    expect(run.errorCode).toBeNull();
    expect(attempts).toBe(2);
    await reconcileCollectionRuns(database.db, boss);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(attempts).toBe(2);
  }, 30_000);

  it("honors a provider Retry-After beyond the HTTP budget without occupying a worker", async () => {
    await boss!.stop({ graceful: true, timeout: 30_000 });
    const [source] = await database.db
      .insert(configuredSources)
      .values({
        providerId: "provider:test-polls",
        name: "Rate-limited source",
        enabled: true,
      })
      .returning({ id: configuredSources.id });
    await database.db.insert(sourceSectionBindings).values({
      sourceId: source.id,
      sectionId: us2026.sectionId,
      enabled: true,
    });
    const connectionString = process.env.TEST_DATABASE_URL!;
    boss = await startCollectionQueue(connectionString, queueSchema);
    const runId = await enqueueCollectionRun(database.db, boss, source.id);
    let attempts = 0;
    await registerPollCollectionWorker(
      database.db,
      boss,
      new Map([
        [
          source.id,
          {
            destinations: [{ scope: us2026, raceId: null }],
            adapter: {
              family: "polls" as const,
              parserVersion: "test-parser-1",
              async fetchPage() {
                attempts++;
                if (attempts === 1)
                  throw new CollectionError(
                    "rate_limited",
                    "Retry after fixture",
                    {
                      retryable: true,
                      retryAfterMs: 3_000,
                    },
                  );
                return {
                  observations: [],
                  quarantined: [],
                  nextCursor: null,
                  hasMore: false,
                  acquiredAt: new Date().toISOString(),
                };
              },
            },
          },
        ],
      ]),
    );
    const until = Date.now() + 10_000;
    let notBefore: Date | null = null;
    while (Date.now() < until) {
      const [run] = await database.db
        .select()
        .from(collectionRuns)
        .where(eq(collectionRuns.id, runId));
      if (run?.retryNotBefore) {
        notBefore = run.retryNotBefore;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(notBefore).not.toBeNull();
    expect(attempts).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(attempts).toBe(1);
    const completed = await awaitStatus(runId, "succeeded", 20_000);
    expect(completed.retryNotBefore).toBeNull();
    expect(attempts).toBe(2);
  }, 35_000);

  it("skips a source disabled after enqueue and still completes another source", async () => {
    await boss!.stop({ graceful: true, timeout: 30_000 });
    const sources = await database.db
      .insert(configuredSources)
      .values([
        {
          providerId: "provider:test-polls",
          name: "Paused source",
          enabled: true,
        },
        {
          providerId: "provider:test-polls",
          name: "Healthy source",
          enabled: true,
        },
      ])
      .returning({ id: configuredSources.id });
    await database.db.insert(sourceSectionBindings).values(
      sources.map((source) => ({
        sourceId: source.id,
        sectionId: us2026.sectionId,
        enabled: true,
      })),
    );
    boss = await startCollectionQueue(
      process.env.TEST_DATABASE_URL!,
      queueSchema,
    );
    const pausedRunId = await enqueueCollectionRun(
      database.db,
      boss,
      sources[0].id,
    );
    const healthyRunId = await enqueueCollectionRun(
      database.db,
      boss,
      sources[1].id,
    );
    await database.db
      .update(configuredSources)
      .set({ enabled: false })
      .where(eq(configuredSources.id, sources[0].id));
    let pausedFetches = 0;
    let healthyFetches = 0;
    const empty = () => ({
      observations: [],
      quarantined: [],
      nextCursor: null,
      hasMore: false,
      acquiredAt: new Date().toISOString(),
    });
    await registerPollCollectionWorker(
      database.db,
      boss,
      new Map([
        [
          sources[0].id,
          {
            destinations: [{ scope: us2026, raceId: null }],
            adapter: {
              family: "polls" as const,
              parserVersion: "test-parser-1",
              async fetchPage() {
                pausedFetches++;
                return empty();
              },
            },
          },
        ],
        [
          sources[1].id,
          {
            destinations: [{ scope: us2026, raceId: null }],
            adapter: {
              family: "polls" as const,
              parserVersion: "test-parser-1",
              async fetchPage() {
                healthyFetches++;
                return empty();
              },
            },
          },
        ],
      ]),
    );
    const paused = await awaitStatus(pausedRunId, "failed");
    const healthy = await awaitStatus(healthyRunId, "succeeded");
    expect(paused.errorCode).toBe("source_disabled");
    expect(pausedFetches).toBe(0);
    expect(healthy.errorCode).toBeNull();
    expect(healthyFetches).toBe(1);
  }, 30_000);

  it("keeps the source cooldown after the run's deferral budget is exhausted", async () => {
    await boss!.stop({ graceful: true, timeout: 30_000 });
    const [source] = await database.db
      .insert(configuredSources)
      .values({
        providerId: "provider:test-polls",
        name: "Cooldown source",
        enabled: true,
      })
      .returning({ id: configuredSources.id });
    await database.db.insert(sourceSectionBindings).values({
      sourceId: source.id,
      sectionId: us2026.sectionId,
      enabled: true,
    });
    boss = await startCollectionQueue(
      process.env.TEST_DATABASE_URL!,
      queueSchema,
    );
    const firstRunId = await enqueueCollectionRun(database.db, boss, source.id);
    await database.db
      .update(collectionRuns)
      .set({ attemptCount: 3 })
      .where(eq(collectionRuns.id, firstRunId));
    let fetches = 0;
    await registerPollCollectionWorker(
      database.db,
      boss,
      new Map([
        [
          source.id,
          {
            destinations: [{ scope: us2026, raceId: null }],
            adapter: {
              family: "polls" as const,
              parserVersion: "test-parser-1",
              async fetchPage() {
                fetches++;
                throw new CollectionError(
                  "rate_limited",
                  "Long Retry-After fixture",
                  {
                    retryable: true,
                    retryAfterMs: 5_000,
                  },
                );
              },
            },
          },
        ],
      ]),
    );
    const first = await awaitStatus(firstRunId, "failed");
    expect(first.errorCode).toBe("rate_limited");
    expect(fetches).toBe(1);
    const [cursor] = await database.db
      .select()
      .from(sourceCursors)
      .where(eq(sourceCursors.sourceId, source.id));
    expect(cursor.notBefore!.getTime()).toBeGreaterThan(Date.now() + 3_000);
    const nextRunId = await enqueueCollectionRun(database.db, boss, source.id);
    expect(nextRunId).not.toBe(firstRunId);
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(fetches).toBe(1);
  }, 20_000);
});
