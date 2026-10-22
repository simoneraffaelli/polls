import { open } from "node:fs/promises";
import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { enqueueModelJob } from "../infrastructure/jobs/model-queue";

const maxBytes = 5_000_000;

async function main(): Promise<void> {
  const filePath = process.env.MODEL_SNAPSHOT_FILE;
  const iterations = Number(process.env.MODEL_ITERATIONS);
  if (
    !filePath ||
    !Number.isInteger(iterations) ||
    iterations < 100 ||
    iterations > 20_000 ||
    process.argv.length !== 2
  )
    throw new Error("Model enqueue environment is incomplete");
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
  const config = readWorkerConfig(process.env);
  const jobId = await enqueueModelJob(config.databaseUrl, {
    snapshot: raw,
    iterations,
  });
  process.stdout.write(`Model job ${jobId} queued.\n`);
}

main().catch(() => {
  process.stderr.write(
    "Model enqueue failed; verify snapshot, queue installation, and database.\n",
  );
  process.exitCode = 1;
});
