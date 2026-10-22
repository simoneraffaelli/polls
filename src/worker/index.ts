import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { createDatabase } from "../infrastructure/database/client";
import {
  reconcileCollectionRuns,
  registerCollectionWorker,
  startCollectionQueue,
  syncPollCollectionSchedules,
  type CollectionSourceRegistration,
} from "../infrastructure/jobs/collection-queue";
import { readCollectionSourceRegistry } from "../composition/source-registry";

const sources = new Map<string, CollectionSourceRegistration>();

async function main(): Promise<void> {
  const config = readWorkerConfig(process.env);
  const database = createDatabase({
    connectionString: config.databaseUrl,
    max: 3,
  });
  let boss: Awaited<ReturnType<typeof startCollectionQueue>> | undefined;
  try {
    boss = await startCollectionQueue(config.databaseUrl);
    const initial = await readCollectionSourceRegistry(database.db);
    for (const [id, registration] of initial) sources.set(id, registration);
    await syncPollCollectionSchedules(boss, sources);
    await reconcileCollectionRuns(database.db, boss);
    await registerCollectionWorker(
      database.db,
      boss,
      sources,
      async (sourceId) => {
        const fresh = await readCollectionSourceRegistry(database.db);
        const registration = fresh.get(sourceId);
        if (registration) sources.set(sourceId, registration);
        return registration;
      },
    );
    console.info("Worker ready; registered sources:", sources.size);
  } catch {
    if (boss) await boss.stop({ graceful: true, timeout: 30_000 });
    await database.close();
    throw new Error("Worker startup failed");
  }

  let stopping = false;
  let refreshing = false;
  const refresh = setInterval(() => {
    if (stopping || refreshing) return;
    refreshing = true;
    void readCollectionSourceRegistry(database.db)
      .then(async (updated) => {
        if (stopping) return;
        sources.clear();
        for (const [id, registration] of updated) sources.set(id, registration);
        await syncPollCollectionSchedules(boss, sources);
      })
      .catch(() => console.error("Collection source refresh failed"))
      .finally(() => {
        refreshing = false;
      });
  }, 60_000);
  refresh.unref();
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(refresh);
    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
      await database.close();
      console.info("Worker stopped.");
    } catch {
      console.error("Worker shutdown failed.");
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}

main().catch(() => {
  // Database URLs and source payloads never appear in startup logs.
  console.error(
    "Worker startup failed; check configuration, database migrations and queue installation.",
  );
  process.exitCode = 1;
});
