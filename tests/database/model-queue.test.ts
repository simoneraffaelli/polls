import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  installCollectionQueue,
  MODEL_QUEUE,
  startCollectionQueue,
} from "../../src/infrastructure/jobs/collection-queue";
import { registerModelWorker } from "../../src/infrastructure/jobs/model-queue";
import { createIsolatedDatabase, type IsolatedDatabase } from "./harness";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "bounded model worker on PostgreSQL",
  () => {
    let database: IsolatedDatabase;
    let control: pg.Pool;
    let boss: Awaited<ReturnType<typeof startCollectionQueue>> | undefined;
    const queueSchema = `polls_test_model_jobs_${randomBytes(8).toString("hex")}`;

    beforeAll(async () => {
      database = await createIsolatedDatabase();
      const connectionString = process.env.TEST_DATABASE_URL!;
      control = new pg.Pool({ connectionString, max: 1 });
      await installCollectionQueue(connectionString, queueSchema);
    }, 30_000);

    afterAll(async () => {
      if (boss) await boss.stop({ graceful: true, timeout: 30_000 });
      if (control) {
        await control.query(`DROP SCHEMA IF EXISTS "${queueSchema}" CASCADE`);
        await control.end();
      }
      if (database) await database.cleanup();
    }, 30_000);

    it("retains a queued request across restart and deadletters malformed input", async () => {
      const connectionString = process.env.TEST_DATABASE_URL!;
      boss = await startCollectionQueue(connectionString, queueSchema);
      const jobId = await boss.send(MODEL_QUEUE, {
        iterations: 0,
        snapshot: {},
      });
      expect(jobId).toBeTruthy();
      await boss.stop({ graceful: true, timeout: 30_000 });
      boss = await startCollectionQueue(connectionString, queueSchema);
      await registerModelWorker(database.db, boss);
      const until = Date.now() + 20_000;
      while (Date.now() < until) {
        const job = await boss.getJobById(MODEL_QUEUE, jobId!);
        if (job?.state === "failed") {
          expect(job.output).toMatchObject({ code: "schema" });
          expect(job.retryCount).toBe(0);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error("Malformed model job was not deadlettered");
    }, 30_000);
  },
);
