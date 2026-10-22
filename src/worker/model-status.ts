import { z } from "zod";
import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { readModelJobStatus } from "../infrastructure/jobs/model-queue";

async function main(): Promise<void> {
  if (process.argv.length !== 2)
    throw new Error("Model status does not accept command-line arguments");
  const jobId = z.uuid().parse(process.env.MODEL_JOB_ID);
  const config = readWorkerConfig(process.env);
  const status = await readModelJobStatus(config.databaseUrl, jobId);
  if (!status) {
    process.stdout.write("Model job not found.\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(status)}\n`);
}

main().catch(() => {
  process.stderr.write(
    "Model job status failed; verify job ID, queue installation, and database.\n",
  );
  process.exitCode = 1;
});
