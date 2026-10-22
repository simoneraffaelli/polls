import pg from "pg";
import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { applyMigrations } from "../infrastructure/database/migrate";
import { installCollectionQueue } from "../infrastructure/jobs/collection-queue";

/** Release-only entrypoint. Application containers never receive the owner password. */
async function main(): Promise<void> {
  const config = readWorkerConfig(process.env);
  const password = process.env.APP_DATABASE_PASSWORD;
  if (!password || password.length < 16 || password === process.env.PGPASSWORD)
    throw new Error("A distinct runtime database password is required");
  if (process.env.PGUSER === "polls_app")
    throw new Error("Migrations require the database owner");
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock(hashtext('polls:release'))");
    await applyMigrations(pool);
    await installCollectionQueue(config.databaseUrl);
    await client.query("BEGIN");
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'polls_app') THEN
        CREATE ROLE polls_app;
      END IF;
      IF EXISTS (
        SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
        WHERE r.rolname = 'polls_app'
      ) THEN
        RAISE EXCEPTION 'Runtime role has unexpected memberships';
      END IF;
    END $$`);
    // escapeLiteral is the driver's SQL quoting primitive; secrets are never logged.
    await client.query(
      `ALTER ROLE polls_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${pg.escapeLiteral(password)}`,
    );
    await client.query("GRANT USAGE ON SCHEMA public, polls_jobs TO polls_app");
    await client.query(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, polls_jobs TO polls_app",
    );
    await client.query(
      "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, polls_jobs TO polls_app",
    );
    await client.query("COMMIT");
    console.info("Release migrations and runtime permissions ready.");
  } catch {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw new Error("Release preparation failed");
  } finally {
    await client
      ?.query("SELECT pg_advisory_unlock(hashtext('polls:release'))")
      .catch(() => undefined);
    client?.release();
    await pool.end();
  }
}

main().catch(() => {
  console.error(
    "Release preparation failed; inspect configuration and migration compatibility.",
  );
  process.exitCode = 1;
});
