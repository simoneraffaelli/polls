import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../database/client";
import {
  forecastQuestions,
  forecastRuns,
  publicationHistory,
} from "../database/schema";

export type AdminForecastRunSummary = Readonly<{
  runId: string;
  runSequence: number;
  questionId: string;
  questionLabel: string;
  questionSlug: string;
  editionId: string;
  kind: "forecast" | "retrospective_reconstruction";
  status: "published" | "sealed_unpublished" | "in_progress";
  qualityStatus: "complete" | "incomplete";
  modelStatus: "experimental" | "validated";
  inputAsOf: string;
  createdAt: string;
  completedAt: string | null;
  publicationId: string | null;
  publishedAt: string | null;
}>;

/** Admin-only bounded metadata; never selects snapshots, result JSON or diagnostics. */
export async function readAdminForecastRunSummary(
  db: Database,
): Promise<readonly AdminForecastRunSummary[]> {
  const rows = await db
    .select({
      runId: forecastRuns.id,
      runSequence: forecastRuns.runSequence,
      questionId: forecastRuns.questionId,
      questionLabel: forecastQuestions.outcomeDefinition,
      questionSlug: forecastQuestions.slug,
      editionId: forecastRuns.editionId,
      kind: forecastRuns.kind,
      qualityStatus: forecastRuns.qualityStatus,
      modelStatus: forecastRuns.modelStatus,
      inputAsOf: forecastRuns.inputAsOf,
      createdAt: forecastRuns.createdAt,
      completedAt: forecastRuns.completedAt,
      sealed: forecastRuns.sealed,
      publicationId: publicationHistory.id,
      publishedAt: publicationHistory.publishedAt,
    })
    .from(forecastRuns)
    .innerJoin(
      forecastQuestions,
      eq(forecastQuestions.id, forecastRuns.questionId),
    )
    .leftJoin(publicationHistory, eq(publicationHistory.runId, forecastRuns.id))
    .orderBy(desc(forecastRuns.createdAt), desc(forecastRuns.runSequence))
    .limit(50);
  return rows.map((row) => ({
    runId: row.runId,
    runSequence: row.runSequence,
    questionId: row.questionId,
    questionLabel: row.questionLabel,
    questionSlug: row.questionSlug,
    editionId: row.editionId,
    kind: z.enum(["forecast", "retrospective_reconstruction"]).parse(row.kind),
    status:
      row.publicationId !== null
        ? "published"
        : row.sealed
          ? "sealed_unpublished"
          : "in_progress",
    qualityStatus: z.enum(["complete", "incomplete"]).parse(row.qualityStatus),
    modelStatus: z.enum(["experimental", "validated"]).parse(row.modelStatus),
    inputAsOf: row.inputAsOf.toISOString(),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    publicationId: row.publicationId,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  }));
}
