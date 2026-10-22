import pg from "pg";
import { readWorkerConfig } from "../src/infrastructure/config/worker-env";
import { applyMigrations } from "../src/infrastructure/database/migrate";

async function main(): Promise<void> {
  const databaseUrl =
    process.env.DATABASE_URL ?? readWorkerConfig(process.env).databaseUrl;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await applyMigrations(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Never print connection strings or credentials from the underlying driver.
  process.stderr.write(
    `Database migration failed: ${error instanceof Error ? error.name : "UnknownError"}\n`,
  );
  process.exitCode = 1;
});
