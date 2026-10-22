import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  parseModelSnapshot,
  structuralReferencePayloadSchema,
} from "../../elections/model/snapshot-schema";
import { parseModelResult } from "../../elections/model/result-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import type {
  ModelSnapshot,
  ModelResult,
} from "../../elections/model/contracts";
import {
  contentHashSchema,
  editionScopeSchema,
  internalIdSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { ForecastReadState } from "../../platform/publication/forecast";
import type { Database } from "./client";
import {
  editions,
  forecastQuestions,
  forecastResults,
  forecastRunPollInputs,
  forecastRuns,
  pollEditionLinks,
  pollForecastExclusions,
  pollLinkDecisions,
  pollModelOptionMappings,
  pollOptions,
  pollQuestions,
  pollRevisions,
  runModelSnapshots,
  structuralModelReferences,
} from "./schema";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

async function verifyModelEvidence(
  tx: DatabaseTransaction,
  snapshot: ModelSnapshot,
  _result: ModelResult,
  pollInputs: readonly { revisionId: string; pollLinkId: string }[],
) {
  if (snapshot.polls.length === 0 || snapshot.polls.length > 500)
    throw new Error("Model poll verification budget or minimum was not met");
  const asOf = new Date(snapshot.inputAsOf);
  const [reference] = await tx
    .select()
    .from(structuralModelReferences)
    .where(eq(structuralModelReferences.id, snapshot.structuralReferenceId));
  if (
    !reference ||
    reference.questionId !== snapshot.questionId ||
    reference.editionId !== snapshot.scope.editionId ||
    (snapshot.kind === "forecast" &&
      (
        await tx.execute(
          sql`SELECT 1 FROM structural_model_references WHERE id = ${snapshot.structuralReferenceId} AND available_at <= ${asOf} AND acquired_at <= ${asOf} AND reviewed_at <= ${asOf}`,
        )
      ).rows.length !== 1)
  )
    throw new Error("Reviewed structural reference is unavailable as of run");
  const payload = structuralReferencePayloadSchema.parse(reference.payload);
  if (
    (await snapshotDigest(payload)) !== reference.contentHash ||
    (await snapshotDigest(payload)) !==
      (await snapshotDigest({
        catalogVersion: snapshot.catalogVersion,
        races: snapshot.races,
        control: snapshot.control,
      }))
  )
    throw new Error("Model structural inputs differ from reviewed reference");
  const listed = new Set(
    pollInputs.map(
      ({ revisionId, pollLinkId }) => `${revisionId}:${pollLinkId}`,
    ),
  );
  if (
    listed.size !== pollInputs.length ||
    listed.size !== snapshot.polls.length ||
    snapshot.polls.some(
      (poll) => !listed.has(`${poll.revisionId}:${poll.pollLinkId}`),
    )
  )
    throw new Error("Model poll signals differ from run revision references");
  for (const poll of snapshot.polls) {
    if (
      poll.quality !== 1 ||
      poll.availability !== "actual_acquisition" ||
      poll.availableAt !== poll.acquiredAt
    )
      throw new Error(
        "Only unrated acquired poll signals are supported by policy v1",
      );
    const [revision] = await tx
      .select()
      .from(pollRevisions)
      .where(eq(pollRevisions.id, poll.revisionId));
    if (!revision || !revision.sealed)
      throw new Error("Unknown or unsealed poll revision");
    const source = await tx.execute(
      sql`SELECT excluded_from_forecasts FROM configured_sources WHERE id = ${revision.sourceId} FOR SHARE`,
    );
    if (
      source.rows.length !== 1 ||
      source.rows[0]?.excluded_from_forecasts !== false
    )
      throw new Error("Poll source is excluded from future forecasts");
    await tx.execute(
      sql`SELECT id FROM poll_records WHERE id = ${revision.pollId} FOR UPDATE`,
    );
    const [link] = await tx
      .select({
        pollId: pollEditionLinks.pollId,
        editionId: pollEditionLinks.editionId,
        raceId: pollEditionLinks.raceId,
        availableByAsOf: sql<boolean>`${pollEditionLinks.createdAt} <= ${asOf}`,
      })
      .from(pollEditionLinks)
      .where(eq(pollEditionLinks.id, poll.pollLinkId));
    if (
      !link ||
      link.pollId !== revision.pollId ||
      link.editionId !== snapshot.scope.editionId ||
      link.raceId !== poll.raceId ||
      !link.availableByAsOf
    )
      throw new Error("Poll association was not valid at input as-of");
    const [exclusion] = await tx
      .select({ excluded: pollForecastExclusions.excluded })
      .from(pollForecastExclusions)
      .where(
        and(
          eq(pollForecastExclusions.pollId, revision.pollId),
          eq(pollForecastExclusions.editionId, snapshot.scope.editionId),
        ),
      )
      .orderBy(
        desc(pollForecastExclusions.recordedAt),
        desc(pollForecastExclusions.id),
      )
      .limit(1);
    if (exclusion?.excluded)
      throw new Error("Poll was excluded from future forecasts");
    const [decision] = await tx
      .select({ included: pollLinkDecisions.included })
      .from(pollLinkDecisions)
      .where(and(eq(pollLinkDecisions.pollLinkId, poll.pollLinkId)))
      .orderBy(desc(pollLinkDecisions.recordedAt), desc(pollLinkDecisions.id))
      .limit(1);
    if (decision?.included === false)
      throw new Error("Poll association was removed for future forecasts");
    const [mapping] = await tx
      .select({
        id: pollModelOptionMappings.id,
        positiveOptionId: pollModelOptionMappings.positiveOptionId,
        negativeOptionId: pollModelOptionMappings.negativeOptionId,
        positivePartyId: pollModelOptionMappings.positivePartyId,
        negativePartyId: pollModelOptionMappings.negativePartyId,
        positiveCaucusId: pollModelOptionMappings.positiveCaucusId,
        negativeCaucusId: pollModelOptionMappings.negativeCaucusId,
        availableByAsOf: sql<boolean>`${pollModelOptionMappings.reviewedAt} <= ${asOf}`,
      })
      .from(pollModelOptionMappings)
      .where(
        and(
          eq(pollModelOptionMappings.revisionId, poll.revisionId),
          eq(
            pollModelOptionMappings.externalQuestionId,
            poll.externalQuestionId,
          ),
          eq(pollModelOptionMappings.raceId, poll.raceId),
        ),
      )
      .orderBy(
        desc(pollModelOptionMappings.reviewedAt),
        desc(pollModelOptionMappings.id),
      )
      .limit(1);
    const race = snapshot.races.find((item) => item.raceId === poll.raceId);
    if (
      !race ||
      !mapping ||
      !mapping.availableByAsOf ||
      mapping.id !== poll.optionMappingId ||
      mapping.positiveOptionId !== poll.positiveOptionId ||
      mapping.negativeOptionId !== poll.negativeOptionId ||
      mapping.positivePartyId !== race.positive.partyId ||
      mapping.negativePartyId !== race.negative.partyId ||
      mapping.positiveCaucusId !== race.positive.caucusId ||
      mapping.negativeCaucusId !== race.negative.caucusId
    )
      throw new Error(
        "Poll option orientation lacks matching reviewed evidence",
      );
    const [question] = await tx
      .select()
      .from(pollQuestions)
      .where(
        and(
          eq(pollQuestions.revisionId, poll.revisionId),
          eq(pollQuestions.externalQuestionId, poll.externalQuestionId),
        ),
      );
    if (!question || question.kind !== "vote_intent")
      throw new Error("Model signal needs a race vote-intent question");
    const options = await tx
      .select({ id: pollOptions.optionId, percentage: pollOptions.percentage })
      .from(pollOptions)
      .where(
        and(
          eq(pollOptions.revisionId, poll.revisionId),
          eq(pollOptions.externalQuestionId, poll.externalQuestionId),
        ),
      );
    const positive = options.find(
      (option) => option.id === poll.positiveOptionId,
    );
    const negative = options.find(
      (option) => option.id === poll.negativeOptionId,
    );
    if (
      !positive ||
      !negative ||
      Math.abs(
        Number(positive.percentage) -
          Number(negative.percentage) -
          poll.marginPoints,
      ) > 0.00001 ||
      revision.pollster !== poll.pollsterId ||
      revision.fieldworkEnd !== poll.observedEndDate ||
      revision.acquiredAt.getTime() !== new Date(poll.acquiredAt).getTime() ||
      question.populationKind !== poll.population ||
      question.sampleGroupId !== poll.sampleGroupId ||
      question.sampleSize !== poll.sampleSize
    )
      throw new Error("Poll model signal differs from immutable raw revision");
  }
}

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
  if (evidence && evidenceHashes) {
    if (
      evidence.snapshot.questionId !== input.questionId ||
      evidence.snapshot.scope.sectionId !== input.scope.sectionId ||
      evidence.snapshot.scope.editionId !== input.scope.editionId ||
      evidence.snapshot.kind !== input.kind ||
      evidence.snapshot.inputAsOf !== input.inputAsOf ||
      evidence.snapshot.modelVersion !== input.modelVersion ||
      evidence.snapshot.parameterVersion !== input.parameterVersion ||
      evidence.snapshot.seed !== input.seed ||
      evidenceHashes.snapshot !== input.inputSnapshotHash ||
      evidence.result.seed !== input.seed ||
      evidence.result.parametersVersion !== input.parameterVersion ||
      evidence.result.modelStatus !== input.modelStatus ||
      evidence.result.diagnostics.quality !== input.qualityStatus ||
      JSON.stringify(evidence.result.questionOutcomeProbabilities) !==
        JSON.stringify(input.results)
    )
      throw new Error("Model evidence does not match run metadata or results");
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM forecast_questions WHERE id = ${input.questionId} FOR UPDATE`,
    );
    const [question] = await tx
      .select({
        id: forecastQuestions.id,
        cutoffAt: forecastQuestions.cutoffAt,
        resolutionRuleVersion: forecastQuestions.resolutionRuleVersion,
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
      if (
        new Date(evidence.snapshot.cutoffAt).getTime() !==
        question.cutoffAt.getTime()
      )
        throw new Error(
          "Model cutoff differs from current question definition",
        );
      await verifyModelEvidence(
        tx,
        evidence.snapshot,
        evidence.result,
        input.pollInputs,
      );
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
