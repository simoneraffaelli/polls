import { createDatabase } from "./client";
import { readWorkerConfig } from "../config/worker-env";

let database: ReturnType<typeof createDatabase> | undefined;

/** An absent configuration is a development state; a partial one is an error. */
export function getRuntimeDatabase(): ReturnType<typeof createDatabase> | null {
  if (database) return database;
  const keys = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"];
  if (keys.every((key) => !process.env[key])) return null;
  const { databaseUrl } = readWorkerConfig(process.env);
  database = createDatabase({
    connectionString: databaseUrl,
    max: 3,
    connectionTimeoutMillis: 2_000,
    statement_timeout: 2_000,
    idleTimeoutMillis: 30_000,
  });
  return database;
}
