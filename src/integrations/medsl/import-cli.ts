import { createDatabase } from "../../infrastructure/database/client";
import { readWorkerConfig } from "../../infrastructure/config/worker-env";
import { importHistoricalResults } from "../../infrastructure/database/historical-repository";
import { preparePinnedSenateV8Import } from "./prepared-import";
import { MEDSL_SENATE_V8 } from "./senate";

/** Explicit local operator command; no network or automatic worker schedule. */
async function main(): Promise<void> {
  const prepared = preparePinnedSenateV8Import();
  const { databaseUrl } = readWorkerConfig(process.env);
  const database = createDatabase({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 120_000,
  });
  try {
    const result = await importHistoricalResults(
      database.db,
      {
        doi: MEDSL_SENATE_V8.doi,
        version: MEDSL_SENATE_V8.version,
        fileSha256: MEDSL_SENATE_V8.originalFileSha256,
        parserVersion: "medsl-senate-v8-parser-v1",
        availableAt: MEDSL_SENATE_V8.availableAt,
        acquiredAt: new Date().toISOString(),
      },
      prepared,
    );
    process.stdout.write(
      `${JSON.stringify({ dataset: MEDSL_SENATE_V8.doi, version: MEDSL_SENATE_V8.version, expected: prepared.length, ...result })}\n`,
    );
  } finally {
    await database.close();
  }
}

main().catch(() => {
  process.stderr.write(
    "Historical import failed; check controlled diagnostics.\n",
  );
  process.exitCode = 1;
});
