import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseModelSnapshot } from "../../elections/model/snapshot-schema";
import { parseModelResult } from "../../elections/model/result-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import { editionScopeSchema } from "../../platform/data/primitives";
import type { Database } from "./client";
import {
  currentPublications,
  editions,
  forecastQuestions,
  forecastRuns,
  publicationHistory,
  runModelSnapshots,
} from "./schema";

const requestSchema = z.strictObject({
  scope: editionScopeSchema,
  questionId: z.uuid(),
});

/** Only the currently published or cutoff-frozen reference can feed scenarios. */
export async function readPublishedModel(db: Database, raw: unknown) {
  const input = requestSchema.parse(raw);
  const [row] = await db
    .select({
      questionId: forecastQuestions.id,
      storedState: forecastQuestions.storedState,
      closedByClock: sql<boolean>`clock_timestamp() >= ${forecastQuestions.cutoffAt}`,
      publicationId: publicationHistory.id,
      runId: forecastRuns.id,
      runSequence: forecastRuns.runSequence,
      sealed: forecastRuns.sealed,
      kind: forecastRuns.kind,
      qualityStatus: forecastRuns.qualityStatus,
      inputSnapshotHash: forecastRuns.inputSnapshotHash,
      inputAsOf: forecastRuns.inputAsOf,
      publishedAt: publicationHistory.publishedAt,
      cutoffAtPublication: publicationHistory.cutoffAtPublication,
      cutoffVersion: publicationHistory.cutoffVersion,
      modelStatus: forecastRuns.modelStatus,
      modelVersion: forecastRuns.modelVersion,
      parameterVersion: forecastRuns.parameterVersion,
      snapshotHash: runModelSnapshots.snapshotHash,
      resultHash: runModelSnapshots.resultHash,
      snapshot: runModelSnapshots.snapshot,
      result: runModelSnapshots.result,
    })
    .from(currentPublications)
    .innerJoin(
      forecastQuestions,
      eq(forecastQuestions.id, currentPublications.questionId),
    )
    .innerJoin(editions, eq(editions.id, forecastQuestions.editionId))
    .innerJoin(
      publicationHistory,
      eq(publicationHistory.id, currentPublications.publicationId),
    )
    .innerJoin(forecastRuns, eq(forecastRuns.id, currentPublications.runId))
    .innerJoin(runModelSnapshots, eq(runModelSnapshots.runId, forecastRuns.id))
    .where(
      and(
        eq(currentPublications.questionId, input.questionId),
        eq(currentPublications.editionId, input.scope.editionId),
        eq(editions.sectionId, input.scope.sectionId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const snapshot = parseModelSnapshot(row.snapshot);
  const result = parseModelResult(row.result);
  if (
    !row.sealed ||
    row.kind !== "forecast" ||
    row.qualityStatus !== "complete" ||
    row.inputSnapshotHash !== row.snapshotHash ||
    (await snapshotDigest(snapshot)) !== row.snapshotHash ||
    (await snapshotDigest(result)) !== row.resultHash ||
    snapshot.questionId !== row.questionId ||
    snapshot.scope.sectionId !== input.scope.sectionId ||
    snapshot.scope.editionId !== input.scope.editionId ||
    new Date(snapshot.inputAsOf).getTime() !== row.inputAsOf.getTime() ||
    snapshot.modelVersion !== row.modelVersion ||
    snapshot.parameterVersion !== row.parameterVersion ||
    result.seed !== snapshot.seed ||
    result.modelStatus !== row.modelStatus
  )
    throw new Error("Published model evidence does not match its sealed run");
  const state =
    row.storedState !== "open" || row.closedByClock ? "frozen" : "current";
  return {
    publication: {
      state,
      archived: row.storedState === "archived",
      publicationId: row.publicationId,
      runId: row.runId,
      runSequence: row.runSequence,
      publishedAt: row.publishedAt.toISOString(),
      inputAsOf: row.inputAsOf.toISOString(),
      cutoffAtPublication: row.cutoffAtPublication.toISOString(),
      cutoffVersion: row.cutoffVersion,
    },
    proof: {
      snapshotHash: row.snapshotHash,
      resultHash: row.resultHash,
      modelStatus: row.modelStatus,
      modelVersion: row.modelVersion,
      parameterVersion: row.parameterVersion,
      structuralReferenceId: snapshot.structuralReferenceId,
      qualityPolicyVersion: snapshot.qualityPolicyVersion,
    },
    snapshot,
    result,
  } as const;
}

/** Bounded catalog of published, sealed model questions in one edition. */
export async function listPublishedModelQuestions(db: Database, raw: unknown) {
  const input = z
    .strictObject({
      scope: editionScopeSchema,
      limit: z.number().int().min(1).max(20).default(20),
    })
    .parse(raw);
  const rows = await db
    .select({
      questionId: forecastQuestions.id,
      slug: forecastQuestions.slug,
      outcomeDefinition: forecastQuestions.outcomeDefinition,
      storedState: forecastQuestions.storedState,
      closedByClock: sql<boolean>`clock_timestamp() >= ${forecastQuestions.cutoffAt}`,
      publicationId: publicationHistory.id,
      runId: forecastRuns.id,
      modelStatus: forecastRuns.modelStatus,
      publishedAt: publicationHistory.publishedAt,
    })
    .from(currentPublications)
    .innerJoin(
      forecastQuestions,
      eq(forecastQuestions.id, currentPublications.questionId),
    )
    .innerJoin(editions, eq(editions.id, forecastQuestions.editionId))
    .innerJoin(
      publicationHistory,
      eq(publicationHistory.id, currentPublications.publicationId),
    )
    .innerJoin(forecastRuns, eq(forecastRuns.id, currentPublications.runId))
    .innerJoin(runModelSnapshots, eq(runModelSnapshots.runId, forecastRuns.id))
    .where(
      and(
        eq(currentPublications.editionId, input.scope.editionId),
        eq(editions.sectionId, input.scope.sectionId),
        eq(forecastRuns.sealed, true),
        eq(forecastRuns.kind, "forecast"),
        eq(forecastRuns.qualityStatus, "complete"),
      ),
    )
    .orderBy(desc(publicationHistory.publishedAt), desc(forecastQuestions.id))
    .limit(input.limit);
  return rows.map((row) => ({
    questionId: row.questionId,
    slug: row.slug,
    outcomeDefinition: row.outcomeDefinition,
    state:
      row.storedState !== "open" || row.closedByClock
        ? ("frozen" as const)
        : ("current" as const),
    publicationId: row.publicationId,
    runId: row.runId,
    modelStatus: row.modelStatus,
    publishedAt: row.publishedAt.toISOString(),
  }));
}
