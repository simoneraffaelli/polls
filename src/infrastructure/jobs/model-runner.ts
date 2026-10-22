import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { parseModelSnapshot } from "../../elections/model/snapshot-schema";
import { parseModelResult } from "../../elections/model/result-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import { simulateBaseline } from "../../elections/model/simulate";
import { assessModelQuality } from "../../elections/model/quality";
import type { Database } from "../database/client";
import { createCompletedForecastRun } from "../database/forecast-repository";
import {
  forecastRuns,
  publicationHistory,
  runModelSnapshots,
} from "../database/schema";

const requestSchema = z.strictObject({
  snapshot: z.unknown(),
  iterations: z.number().int().min(100).max(20_000),
});

/** Explicit worker/CLI invocation only. No page request or clock schedule runs a model. */
export async function runBaselineModel(db: Database, raw: unknown) {
  const request = requestSchema.parse(raw);
  const snapshot = parseModelSnapshot(request.snapshot);
  const inputSnapshotHash = await snapshotDigest(snapshot);
  const readExisting = async () => {
    const [prior] = await db
      .select({
        runId: forecastRuns.id,
        runSequence: forecastRuns.runSequence,
        result: runModelSnapshots.result,
        resultHash: runModelSnapshots.resultHash,
      })
      .from(runModelSnapshots)
      .innerJoin(forecastRuns, eq(forecastRuns.id, runModelSnapshots.runId))
      .where(
        and(
          eq(runModelSnapshots.questionId, snapshot.questionId),
          eq(runModelSnapshots.snapshotHash, inputSnapshotHash),
          eq(runModelSnapshots.iterations, request.iterations),
        ),
      )
      .limit(1);
    if (!prior) return null;
    const priorResult = parseModelResult(prior.result);
    if ((await snapshotDigest(priorResult)) !== prior.resultHash)
      throw new Error("Saved model result hash is invalid");
    const [published] = await db
      .select({ id: publicationHistory.id })
      .from(publicationHistory)
      .where(eq(publicationHistory.runId, prior.runId))
      .limit(1);
    return {
      run: {
        runId: prior.runId,
        runSequence: prior.runSequence,
        publicationId: published?.id ?? null,
      },
      quality: assessModelQuality(snapshot, priorResult),
      publicationId: published?.id ?? null,
      repeated: true,
    } as const;
  };
  const existing = await readExisting();
  if (existing) return existing;
  const result = simulateBaseline(snapshot, request.iterations);
  const quality = assessModelQuality(snapshot, result);
  const run = await createCompletedForecastRun(db, {
    questionId: snapshot.questionId,
    scope: snapshot.scope,
    kind: snapshot.kind,
    inputAsOf: snapshot.inputAsOf,
    pollInputs: snapshot.polls.map((poll) => ({
      revisionId: poll.revisionId,
      pollLinkId: poll.pollLinkId,
    })),
    inputSnapshotHash,
    modelVersion: snapshot.modelVersion,
    parameterVersion: snapshot.parameterVersion,
    modelStatus: result.modelStatus,
    seed: snapshot.seed,
    qualityStatus: result.diagnostics.quality,
    results: result.questionOutcomeProbabilities,
    modelEvidence: { snapshot, result },
    publishIfEligible: quality.status === "experimental_candidate",
  }).catch(async (error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      const committed = await readExisting();
      if (committed) return committed.run;
    }
    throw error;
  });
  return { run, quality, publicationId: run.publicationId, repeated: false };
}
