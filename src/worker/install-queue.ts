import { installCollectionQueue } from "../infrastructure/jobs/collection-queue";
import { readWorkerConfig } from "../infrastructure/config/worker-env";

async function main(): Promise<void> {
  const config = readWorkerConfig(process.env);
  await installCollectionQueue(config.databaseUrl);
  console.info("Collection queue schema ready.");
}

main().catch(() => {
  console.error(
    "Collection queue installation failed; check PostgreSQL connectivity and permissions.",
  );
  process.exitCode = 1;
});
