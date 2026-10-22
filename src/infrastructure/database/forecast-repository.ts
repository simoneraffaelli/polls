import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseModelSnapshot } from "../../elections/model/snapshot-schema";
import { parseModelResult } from "../../elections/model/result-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import {
  contentHashSchema,
  editionScopeSchema,
  internalIdSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { ForecastReadState } from "../../platform/publication/forecast";
import type { Database } from "./client";
import { verifyModelEvidence } from "./model-evidence-verification";
import {
  editions,
  forecastQuestions,
  forecastResults,
  forecastRunPollInputs,
  forecastRuns,
  pollRevisions,
  runModelSnapshots,
} from "./schema";

const createRunSchema = z
  .object({
    questionId: z.uuid(),
    scope: editionScopeSchema,
    kind: z.enum(["forecast", "retrospective_reconstruction"]),
    inputAsOf: utcInstantSchema,
    pollInputs: z
      .array(z.object({ revisionId: z.uuid(), pollLinkId: z.uuid() }))
      .min(1),
    inputSnapshotHash: contentHashSchema,
    modelVersion: internalIdSchema,
    parameterVersion: internalIdSchema,
    modelStatus: z.enum(["experimental", "validated"]),
    seed: internalIdSchema,
    qualityStatus: z.enum(["complete", "incomplete"]),
    results: z.array(
      z.object({
        outcomeId: internalIdSchema,
        probability: z.number().finite().min(0).max(1),
      }),
    ),
    modelEvidence: z
      .object({ snapshot: z.unknown(), result: z.unknown() })
      .optional(),
    publishIfEligible: z.boolean().optional(),
  })
  .superRefine(({ pollInputs, results, qualityStatus }, context) => {
    if (
      new Set(pollInputs.map(({ revisionId }) => revisionId)).size !==
      pollInputs.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["pollInputs"],
        message: "Duplicate input revision",
      });
    }
    if (
      new Set(results.map(({ outcomeId }) => outcomeId)).size !== results.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["results"],
        message: "Duplicate result outcome",
      });
    }
    if (qualityStatus === "complete" && results.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["results"],
        message: "Completed run needs results",
      });
    }
  });

function assertEvidenceMatchesRun(
  input: z.infer<typeof createRunSchema>,
  evidence: {
    snapshot: ReturnType<typeof parseModelSnapshot>;
    result: ReturnType<typeof parseModelResult>;
  },
  snapshotHash: string,
) {
  if (
    evidence.snapshot.questionId !== input.questionId ||
    evidence.snapshot.scope.sectionId !== input.scope.sectionId ||
    evidence.snapshot.scope.editionId !== input.scope.editionId ||
    evidence.snapshot.kind !== input.kind ||
    evidence.snapshot.inputAsOf !== input.inputAsOf ||
    evidence.snapshot.modelVersion !== input.modelVersion ||
    evidence.snapshot.parameterVersion !== input.parameterVersion ||
    evidence.snapshot.seed !== input.seed ||
    snapshotHash !== input.inputSnapshotHash ||
    evidence.result.seed !== input.seed ||
    evidence.result.parametersVersion !== input.parameterVersion ||
    evidence.result.modelStatus !== input.modelStatus ||
    evidence.result.diagnostics.quality !== input.qualityStatus ||
    JSON.stringify(evidence.result.questionOutcomeProbabilities) !==
      JSON.stringify(input.results)
  )
    throw new Error("Model evidence does not match run metadata or results");
}

function assertEvidenceMatchesQuestion(
  snapshot: ReturnType<typeof parseModelSnapshot>,
  question: {
    cutoffAt: Date;
    outcomeDefinition: string;
    resolutionRuleVersion: string;
    raceId: string | null;
  },
) {
  if (
    !snapshot.control ||
    snapshot.control.outcomeKind !== question.outcomeDefinition ||
    snapshot.control.version !== question.resolutionRuleVersion ||
    (question.raceId !== null &&
      (snapshot.races.length !== 1 ||
        snapshot.races[0]?.raceId !== question.raceId))
  )
    throw new Error("Model outcome or resolution rule differs from question");
  if (new Date(snapshot.cutoffAt).getTime() !== question.cutoffAt.getTime())
    throw new Error("Model cutoff differs from current question definition");
}

export async function createCompletedForecastRun(
  db: Database,
  rawInput: unknown,
): Promise<{
  runId: string;
  runSequence: number;
  publicationId: string | null;
}> {
  const input = createRunSchema.parse(rawInput);
  if (input.publishIfEligible && !input.modelEvidence)
    throw new Error("Automatic publication requires immutable model evidence");
  const evidence = input.modelEvidence
    ? {
        snapshot: parseModelSnapshot(input.modelEvidence.snapshot),
        result: parseModelResult(input.modelEvidence.result),
      }
    : null;
  const evidenceHashes = evidence
    ? {
        snapshot: await snapshotDigest(evidence.snapshot),
        result: await snapshotDigest(evidence.result),
      }
    : null;
  if (evidence && evidenceHashes)
    assertEvidenceMatchesRun(input, evidence, evidenceHashes.snapshot);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM forecast_questions WHERE id = ${input.questionId} FOR UPDATE`,
    );
    const [question] = await tx
      .select({
        id: forecastQuestions.id,
        cutoffAt: forecastQuestions.cutoffAt,
        outcomeDefinition: forecastQuestions.outcomeDefinition,
        resolutionRuleVersion: forecastQuestions.resolutionRuleVersion,
        raceId: forecastQuestions.raceId,
      })
      .from(forecastQuestions)
      .innerJoin(editions, eq(editions.id, forecastQuestions.editionId))
      .where(
        and(
          eq(forecastQuestions.id, input.questionId),
          eq(forecastQuestions.editionId, input.scope.editionId),
          eq(editions.sectionId, input.scope.sectionId),
        ),
      );
    if (!question)
      throw new Error("Forecast question does not belong to edition scope");
    if (evidence) {
      assertEvidenceMatchesQuestion(evidence.snapshot, question);
      await verifyModelEvidence(tx, evidence.snapshot, input.pollInputs);
    }
    const clock = await tx.execute(
      sql`SELECT EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS epoch_ms`,
    );
    const createdAt = dateFromEpochMilliseconds(clock.rows[0]?.epoch_ms);

    const [run] = await tx
      .insert(forecastRuns)
      .values({
        questionId: input.questionId,
        editionId: input.scope.editionId,
        kind: input.kind,
        inputAsOf: new Date(input.inputAsOf),
        inputSnapshotHash: input.inputSnapshotHash,
        modelVersion: input.modelVersion,
        parameterVersion: input.parameterVersion,
        modelStatus: input.modelStatus,
        seed: input.seed,
        qualityStatus: input.qualityStatus,
        createdAt,
        completedAt: input.qualityStatus === "complete" ? createdAt : null,
      })
      .returning({
        id: forecastRuns.id,
        runSequence: forecastRuns.runSequence,
      });
    if (!run) throw new Error("Forecast run insert returned no row");

    for (const pollInput of input.pollInputs) {
      const [revision] = await tx
        .select({ pollId: pollRevisions.pollId })
        .from(pollRevisions)
        .where(eq(pollRevisions.id, pollInput.revisionId));
      if (!revision) throw new Error("Unknown poll revision");
      await tx.insert(forecastRunPollInputs).values({
        runId: run.id,
        editionId: input.scope.editionId,
        pollLinkId: pollInput.pollLinkId,
        pollId: revision.pollId,
        revisionId: pollInput.revisionId,
      });
    }
    if (input.results.length > 0) {
      await tx.insert(forecastResults).values(
        input.results.map((result) => ({
          runId: run.id,
          outcomeId: result.outcomeId,
          probability: result.probability.toString(),
        })),
      );
    }
    if (evidence && evidenceHashes) {
      await tx.insert(runModelSnapshots).values({
        runId: run.id,
        questionId: input.questionId,
        editionId: input.scope.editionId,
        schemaVersion: "model-snapshot-v1",
        snapshotHash: evidenceHashes.snapshot,
        resultHash: evidenceHashes.result,
        iterations: evidence.result.iterations,
        snapshot: evidence.snapshot,
        result: evidence.result,
      });
    }
    await tx
      .update(forecastRuns)
      .set({ sealed: true })
      .where(eq(forecastRuns.id, run.id));
    let publicationId: string | null = null;
    if (input.publishIfEligible) {
      const published = await tx.execute(sql`
        INSERT INTO publication_history (question_id, edition_id, run_id)
        VALUES (${input.questionId}, ${input.scope.editionId}, ${run.id})
        RETURNING id
      `);
      if (!published.rows[0]?.id)
        throw new Error("Eligible model publication returned no receipt");
      publicationId = String(published.rows[0].id);
    }
    return { runId: run.id, runSequence: run.runSequence, publicationId };
  });
}

const publicationInputSchema = z.object({
  questionId: z.uuid(),
  runId: z.uuid(),
});

function dateFromEpochMilliseconds(value: unknown): Date {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds))
    throw new Error("Invalid database instant");
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid database instant");
  return date;
}

/** The database trigger locks the question, checks its current cutoff and updates the pointer atomically. */
export async function publishForecast(
  db: Database,
  input: unknown,
): Promise<{
  publicationId: string;
  runId: string;
  runSequence: number;
  inputAsOf: Date;
  publishedAt: Date;
  cutoffAtPublication: Date;
  cutoffVersion: number;
}> {
  const { questionId, runId } = publicationInputSchema.parse(input);
  const result = await db.execute(sql`
    INSERT INTO publication_history (question_id, edition_id, run_id)
    SELECT question_id, edition_id, id FROM forecast_runs
    WHERE id = ${runId} AND question_id = ${questionId}
    RETURNING id, run_id, run_sequence,
      EXTRACT(EPOCH FROM input_as_of) * 1000 AS input_as_of_epoch_ms,
      EXTRACT(EPOCH FROM published_at) * 1000 AS published_at_epoch_ms,
      EXTRACT(EPOCH FROM cutoff_at_publication) * 1000 AS cutoff_epoch_ms,
      cutoff_version
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Unknown forecast run for question");
  return {
    publicationId: String(row.id),
    runId: String(row.run_id),
    runSequence: Number(row.run_sequence),
    inputAsOf: dateFromEpochMilliseconds(row.input_as_of_epoch_ms),
    publishedAt: dateFromEpochMilliseconds(row.published_at_epoch_ms),
    cutoffAtPublication: dateFromEpochMilliseconds(row.cutoff_epoch_ms),
    cutoffVersion: Number(row.cutoff_version),
  };
}

export async function readCurrentPublication(
  db: Database,
  questionId: unknown,
): Promise<ForecastReadState> {
  const id = z.uuid().parse(questionId);
  const result = await db.execute(sql`
    SELECT q.stored_state, c.run_id,
      CASE WHEN q.stored_state <> 'open' OR clock_timestamp() >= q.cutoff_at THEN 1 ELSE 0 END AS is_closed
    FROM forecast_questions q
    LEFT JOIN current_publications c ON c.question_id = q.id
    WHERE q.id = ${id}
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Unknown forecast question");
  const closed = Number(row.is_closed) === 1;
  const runId = row.run_id as string | null;
  if (closed) {
    const archived = row.stored_state === "archived";
    return runId
      ? { kind: "frozen", runId, archived }
      : { kind: "closed_without_run", archived };
  }
  return runId ? { kind: "current", runId } : { kind: "not_published" };
}
