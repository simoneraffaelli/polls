import { open } from "node:fs/promises";
import { createDatabase } from "../infrastructure/database/client";
import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { runBaselineModel } from "../infrastructure/jobs/model-runner";

const maxBytes = 5_000_000;

async function main() {
  const filePath = process.env.MODEL_SNAPSHOT_FILE;
  const iterations = Number(process.env.MODEL_ITERATIONS);
  if (
    !filePath ||
    !Number.isInteger(iterations) ||
    iterations < 100 ||
    iterations > 20_000 ||
    process.argv.length !== 2
  )
    throw new Error("Model execution environment is incomplete");
  const file = await open(filePath, "r");
  let bytes: Buffer;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxBytes)
      throw new Error("Model snapshot exceeds file budget");
    bytes = Buffer.alloc(info.size);
    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== bytes.length)
      throw new Error("Model snapshot changed while reading");
  } finally {
    await file.close();
  }
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  const database = createDatabase({
    connectionString: readWorkerConfig(process.env).databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
  });
  try {
    const result = await runBaselineModel(database.db, {
      snapshot: raw,
      iterations,
    });
    process.stdout.write(
      `Model run ${result.run.runId}: ${result.quality.status}; publication ${result.publicationId ?? "none"}.\n`,
    );
  } finally {
    await database.close();
  }
}

main().catch(() => {
  process.stderr.write(
    "Model run failed; verify snapshot evidence, cutoff, and database.\n",
  );
  process.exitCode = 1;
});
