import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { createDatabase } from "../infrastructure/database/client";
import {
  reconcileCollectionRuns,
  registerPollCollectionWorker,
  startCollectionQueue,
  syncPollCollectionSchedules,
  type PollSourceRegistry,
} from "../infrastructure/jobs/collection-queue";

// Sources are enabled only after their adapter and rights checks are configured.
const sources: PollSourceRegistry = new Map();

async function main(): Promise<void> {
  const config = readWorkerConfig(process.env);
  const database = createDatabase({
    connectionString: config.databaseUrl,
    max: 3,
  });
  let boss: Awaited<ReturnType<typeof startCollectionQueue>> | undefined;
  try {
    boss = await startCollectionQueue(config.databaseUrl);
    await syncPollCollectionSchedules(boss, sources);
    await reconcileCollectionRuns(database.db, boss);
    await registerPollCollectionWorker(database.db, boss, sources);
    console.info("Worker ready; active poll sources:", sources.size);
  } catch {
    if (boss) await boss.stop({ graceful: true, timeout: 30_000 });
    await database.close();
    throw new Error("Worker startup failed");
  }

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
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
