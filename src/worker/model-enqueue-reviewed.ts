import { open } from "node:fs/promises";
import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { createDatabase } from "../infrastructure/database/client";
import { buildReviewedModelSnapshot } from "../infrastructure/database/model-snapshot-builder";
import { enqueueModelJob } from "../infrastructure/jobs/model-queue";

const maxBytes = 65_536;

async function main(): Promise<void> {
  const filePath = process.env.MODEL_ASSEMBLY_FILE;
  const iterations = Number(process.env.MODEL_ITERATIONS);
  if (
    !filePath ||
    !Number.isInteger(iterations) ||
    iterations < 100 ||
    iterations > 20_000 ||
    process.argv.length !== 2
  )
    throw new Error("Reviewed model request environment is incomplete");
  const file = await open(filePath, "r");
  let bytes: Buffer;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxBytes)
      throw new Error("Reviewed model request exceeds file budget");
    bytes = Buffer.alloc(info.size);
    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== bytes.length)
      throw new Error("Reviewed model request changed while reading");
  } finally {
    await file.close();
  }
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  const config = readWorkerConfig(process.env);
  const database = createDatabase({
    connectionString: config.databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
  });
  let snapshot: Awaited<ReturnType<typeof buildReviewedModelSnapshot>>;
  try {
    snapshot = await buildReviewedModelSnapshot(database.db, raw);
  } finally {
    await database.close();
  }
  const jobId = await enqueueModelJob(config.databaseUrl, {
    snapshot,
    iterations,
  });
  process.stdout.write(`Reviewed model job ${jobId} queued.\n`);
}

main().catch(() => {
  process.stderr.write(
    "Reviewed model enqueue failed; verify registered evidence, input as-of, queue, and database.\n",
  );
  process.exitCode = 1;
});
