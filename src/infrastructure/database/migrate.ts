import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** One session holds the lock and performs every migration; it is never run at web startup. */
export async function applyMigrations(
  pool: pg.Pool,
  options: { migrationsSchema?: string; migrationsFolder?: string } = {},
): Promise<void> {
  const migrationsSchema = options.migrationsSchema ?? "drizzle";
  if (!/^[a-z][a-z0-9_]*$/.test(migrationsSchema)) {
    throw new Error("Invalid migrations schema name");
  }
  const client = await pool.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('polls:drizzle-migrations'))",
    );
    await migrate(drizzle(client), {
      migrationsFolder:
        options.migrationsFolder ?? path.resolve(process.cwd(), "drizzle"),
      migrationsSchema,
    });
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('polls:drizzle-migrations'))")
      .catch(() => undefined);
    client.release();
  }
}
