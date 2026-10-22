import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { editionScopeSchema } from "../../platform/data/primitives";
import type { Database } from "./client";
import {
  configuredSources,
  editions,
  forecastResults,
  forecastQuestions,
  forecastRunPollInputs,
  forecastRuns,
  pollRevisions,
  publicationHistory,
  runModelSnapshots,
} from "./schema";

const historyRequest = z.strictObject({
  scope: editionScopeSchema,
  questionId: z.uuid(),
  limit: z.number().int().min(1).max(10),
});

/** Historical publications only: no completed-but-unpublished or retrospective runs. */
export async function readPublicPublicationHistory(db: Database, raw: unknown) {
  const input = historyRequest.parse(raw);
  const rows = await db
    .select({
      publicationId: publicationHistory.id,
      runId: publicationHistory.runId,
      runSequence: publicationHistory.runSequence,
      inputAsOf: publicationHistory.inputAsOf,
      publishedAt: publicationHistory.publishedAt,
      cutoffAtPublication: publicationHistory.cutoffAtPublication,
      cutoffVersion: publicationHistory.cutoffVersion,
      modelStatus: forecastRuns.modelStatus,
    })
    .from(publicationHistory)
    .innerJoin(
      forecastQuestions,
      eq(forecastQuestions.id, publicationHistory.questionId),
    )
    .innerJoin(editions, eq(editions.id, forecastQuestions.editionId))
    .innerJoin(forecastRuns, eq(forecastRuns.id, publicationHistory.runId))
    .innerJoin(runModelSnapshots, eq(runModelSnapshots.runId, forecastRuns.id))
    .where(
      and(
        eq(publicationHistory.questionId, input.questionId),
        eq(publicationHistory.editionId, input.scope.editionId),
        eq(editions.sectionId, input.scope.sectionId),
        eq(forecastRuns.sealed, true),
        eq(forecastRuns.kind, "forecast"),
        eq(forecastRuns.qualityStatus, "complete"),
      ),
    )
    .orderBy(desc(publicationHistory.publishedAt), desc(publicationHistory.id))
    .limit(input.limit + 1);
  const selected = rows.slice(0, input.limit);
  const results = selected.length
    ? await db
        .select({
          runId: forecastResults.runId,
          outcomeId: forecastResults.outcomeId,
          probability: forecastResults.probability,
        })
        .from(forecastResults)
        .where(
          inArray(
            forecastResults.runId,
            selected.map((row) => row.runId),
          ),
        )
        .orderBy(asc(forecastResults.outcomeId))
    : [];
  return {
    items: selected.map((row) => ({
      publicationId: row.publicationId,
      runId: row.runId,
      runSequence: row.runSequence,
      inputAsOf: row.inputAsOf.toISOString(),
      publishedAt: row.publishedAt.toISOString(),
      cutoffAtPublication: row.cutoffAtPublication.toISOString(),
      cutoffVersion: row.cutoffVersion,
      modelStatus: z.enum(["experimental", "validated"]).parse(row.modelStatus),
      outcomes: results
        .filter((result) => result.runId === row.runId)
        .map((result) => ({
          id: result.outcomeId,
          probability: z
            .number()
            .min(0)
            .max(1)
            .parse(Number(result.probability)),
        })),
    })),
    hasMore: rows.length > input.limit,
  };
}

const sourcesRequest = z.strictObject({
  scope: editionScopeSchema,
  runId: z.uuid(),
});

/** Attribution derives from immutable run revision references, not today's source bindings. */
export async function readPublishedInputSources(db: Database, raw: unknown) {
  const input = sourcesRequest.parse(raw);
  const rows = await db
    .select({
      sourceId: configuredSources.id,
      name: configuredSources.name,
      attribution: configuredSources.attribution,
      revisions: sql<number>`count(*)::integer`,
    })
    .from(forecastRunPollInputs)
    .innerJoin(forecastRuns, eq(forecastRuns.id, forecastRunPollInputs.runId))
    .innerJoin(
      publicationHistory,
      and(
        eq(publicationHistory.runId, forecastRuns.id),
        eq(publicationHistory.editionId, input.scope.editionId),
      ),
    )
    .innerJoin(
      forecastQuestions,
      eq(forecastQuestions.id, forecastRuns.questionId),
    )
    .innerJoin(editions, eq(editions.id, forecastQuestions.editionId))
    .innerJoin(
      pollRevisions,
      eq(pollRevisions.id, forecastRunPollInputs.revisionId),
    )
    .innerJoin(
      configuredSources,
      eq(configuredSources.id, pollRevisions.sourceId),
    )
    .where(
      and(
        eq(forecastRunPollInputs.runId, input.runId),
        eq(forecastRunPollInputs.editionId, input.scope.editionId),
        eq(editions.sectionId, input.scope.sectionId),
        eq(forecastRuns.sealed, true),
        eq(forecastRuns.kind, "forecast"),
        eq(forecastRuns.qualityStatus, "complete"),
      ),
    )
    .groupBy(
      configuredSources.id,
      configuredSources.name,
      configuredSources.attribution,
    )
    .orderBy(configuredSources.name)
    .limit(21);
  return { items: rows.slice(0, 20), hasMore: rows.length > 20 };
}
