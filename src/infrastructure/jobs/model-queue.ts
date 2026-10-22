import { PgBoss } from "pg-boss";
import { z } from "zod";
import { parseModelSnapshot } from "../../elections/model/snapshot-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import type { Database } from "../database/client";
import { MODEL_QUEUE, QUEUE_SCHEMA } from "./collection-queue";
import { runBaselineModel } from "./model-runner";

const maxPayloadBytes = 5_000_000;
const jobSchema = z.strictObject({
  snapshot: z.unknown(),
  iterations: z.number().int().min(100).max(20_000),
});
const safeOutputSchema = z.discriminatedUnion("code", [
  z.strictObject({
    code: z.literal("completed"),
    runId: z.uuid(),
    publicationId: z.uuid().nullable(),
    repeated: z.boolean(),
  }),
  z.strictObject({ code: z.literal("budget") }),
  z.strictObject({ code: z.literal("schema") }),
  z.strictObject({ code: z.literal("model_or_database_error") }),
]);

function queueClient(connectionString: string, schema = QUEUE_SCHEMA): PgBoss {
  const boss = new PgBoss({
    connectionString,
    schema,
    migrate: false,
    createSchema: false,
    max: 1,
    schedule: false,
    supervise: false,
    persistQueueStats: false,
  });
  boss.on("error", () => {
    /* The CLI reports only a generic failure, never connection details. */
  });
  return boss;
}

/** A separate bounded worker consumer shares the installed pg-boss schema. */
export async function registerModelWorker(db: Database, boss: PgBoss) {
  await boss.work<z.infer<typeof jobSchema>>(
    MODEL_QUEUE,
    {
      batchSize: 1,
      localConcurrency: 1,
      includeMetadata: true,
      perJobResults: true,
    },
    async ([job]) => {
      if (!job) return [];
      try {
        const serialized = JSON.stringify(job.data);
        if (
          !serialized ||
          Buffer.byteLength(serialized, "utf8") > maxPayloadBytes
        )
          return [
            { id: job.id, status: "deadletter", output: { code: "budget" } },
          ];
        const parsed = jobSchema.safeParse(job.data);
        if (!parsed.success)
          return [
            { id: job.id, status: "deadletter", output: { code: "schema" } },
          ];
        const result = await runBaselineModel(db, parsed.data);
        return [
          {
            id: job.id,
            status: "completed",
            output: {
              code: "completed",
              runId: result.run.runId,
              publicationId: result.publicationId,
              repeated: result.repeated,
            },
          },
        ];
      } catch (error) {
        const code =
          error instanceof z.ZodError ? "schema" : "model_or_database_error";
        return [
          {
            id: job.id,
            status: code === "schema" ? "deadletter" : "failed",
            output: { code },
          },
        ];
      }
    },
  );
}

/** Explicit local CLI publisher; no model schedule or public enqueue endpoint exists. */
export async function enqueueModelJob(connectionString: string, raw: unknown) {
  const input = jobSchema.parse(raw);
  const snapshot = parseModelSnapshot(input.snapshot);
  const data = { snapshot, iterations: input.iterations };
  if (
    Buffer.byteLength(JSON.stringify(data), "utf8") > maxPayloadBytes ||
    input.iterations * snapshot.races.length > 5_000_000
  )
    throw new Error("Model request exceeds worker budget");
  const boss = queueClient(connectionString);
  try {
    await boss.start({ attempts: 2 });
    const jobId = await boss.send(MODEL_QUEUE, data, {
      singletonKey: `${await snapshotDigest(snapshot)}:${input.iterations}`,
    });
    if (!jobId) throw new Error("Model queue did not accept request");
    return jobId;
  } finally {
    await boss.stop({ graceful: true, timeout: 10_000 });
  }
}

/** Safe, read-only job metadata for local diagnostics. Never returns job.data. */
export async function readModelJobStatus(
  connectionString: string,
  jobId: string,
  schema = QUEUE_SCHEMA,
) {
  z.uuid().parse(jobId);
  const boss = queueClient(connectionString, schema);
  try {
    await boss.start({ attempts: 2 });
    const job = await boss.getJobById(MODEL_QUEUE, jobId);
    if (!job) return null;
    const safeOutput = safeOutputSchema.safeParse(job.output);
    return {
      id: job.id,
      state: job.state,
      retryCount: job.retryCount,
      createdAt: job.createdOn.toISOString(),
      startAfter: job.startAfter.toISOString(),
      startedAt: job.startedOn?.toISOString() ?? null,
      completedAt: job.completedOn?.toISOString() ?? null,
      output: safeOutput.success ? safeOutput.data : { code: null },
    };
  } finally {
    await boss.stop({ graceful: true, timeout: 10_000 });
  }
}
