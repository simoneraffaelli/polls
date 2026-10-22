import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { createDatabase } from "../infrastructure/database/client";
import { seedObservatoryStructure } from "./sources";

async function main(): Promise<void> {
  const config = readWorkerConfig(process.env);
  const database = createDatabase({
    connectionString: config.databaseUrl,
    max: 1,
  });
  try {
    const result = await seedObservatoryStructure(database.db);
    console.info(
      `Observatory structure ready: ${result.raceCount} races, ${result.sourceIds.length} disabled-by-default source definitions.`,
    );
  } finally {
    await database.close();
  }
}

main().catch(() => {
  console.error(
    "Observatory seed failed; check PostgreSQL connectivity, migrations and catalog identity.",
  );
  process.exitCode = 1;
});
