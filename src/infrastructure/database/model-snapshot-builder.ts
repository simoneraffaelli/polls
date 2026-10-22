import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { aggregateRaces } from "../../elections/model/aggregate";
import {
  modelSnapshotSchema,
  parseModelSnapshot,
  structuralReferencePayloadSchema,
} from "../../elections/model/snapshot-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import {
  editionScopeSchema,
  internalIdSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { Database } from "./client";
import {
  editions,
  forecastQuestions,
  structuralModelReferences,
} from "./schema";

const requestSchema = z.strictObject({
  questionId: z.uuid(),
  scope: editionScopeSchema,
  structuralReferenceId: z.uuid(),
  inputAsOf: utcInstantSchema,
  kind: z.enum(["forecast", "retrospective_reconstruction"]),
  modelVersion: internalIdSchema,
  parameters: modelSnapshotSchema.shape.parameters,
  seed: internalIdSchema,
});

const candidateSchema = z.object({
  revision_id: z.uuid(),
  link_id: z.uuid(),
  race_id: z.uuid(),
  pollster: z.string(),
  fieldwork_end: z.string(),
  acquired_epoch_ms: z.coerce.number().int().nonnegative(),
  external_question_id: z.string(),
  sample_group_id: z.string(),
  population_kind: z.enum([
    "likely_voters",
    "registered_voters",
    "adults",
    "other",
  ]),
  sample_size: z.number().int().nullable(),
  mapping_id: z.uuid(),
  positive_option_id: z.string(),
  negative_option_id: z.string(),
  positive_party_id: z.string(),
  negative_party_id: z.string(),
  positive_caucus_id: z.string().nullable(),
  negative_caucus_id: z.string().nullable(),
  positive_percentage: z.string(),
  negative_percentage: z.string(),
});

async function loadReviewedContext(
  db: Database,
  input: z.infer<typeof requestSchema>,
  asOf: Date,
) {
  const [question] = await db
    .select({
      id: forecastQuestions.id,
      raceId: forecastQuestions.raceId,
      outcomeDefinition: forecastQuestions.outcomeDefinition,
      resolutionRuleVersion: forecastQuestions.resolutionRuleVersion,
      cutoffAt: forecastQuestions.cutoffAt,
      storedState: forecastQuestions.storedState,
      closedByClock: sql<boolean>`clock_timestamp() >= ${forecastQuestions.cutoffAt}`,
      asOfInFuture: sql<boolean>`${asOf} > clock_timestamp()`,
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
  if (!question) throw new Error("Model question is outside edition scope");
  if (question.asOfInFuture)
    throw new Error("Model input as-of is in the future");
  if (
    input.kind === "forecast" &&
    (question.storedState !== "open" || question.closedByClock)
  )
    throw new Error("Question is closed to new forecasts");
  const [reference] = await db
    .select({
      questionId: structuralModelReferences.questionId,
      editionId: structuralModelReferences.editionId,
      contentHash: structuralModelReferences.contentHash,
      payload: structuralModelReferences.payload,
      availableByAsOf: sql<boolean>`${structuralModelReferences.availableAt} <= ${asOf} AND ${structuralModelReferences.acquiredAt} <= ${asOf} AND ${structuralModelReferences.reviewedAt} <= ${asOf}`,
    })
    .from(structuralModelReferences)
    .where(eq(structuralModelReferences.id, input.structuralReferenceId));
  if (
    !reference ||
    reference.questionId !== input.questionId ||
    reference.editionId !== input.scope.editionId ||
    !reference.availableByAsOf
  )
    throw new Error(
      "Reviewed structural reference is unavailable at input as-of",
    );
  const payload = structuralReferencePayloadSchema.parse(reference.payload);
  if ((await snapshotDigest(payload)) !== reference.contentHash)
    throw new Error("Reviewed structural reference hash differs from payload");
  if (
    payload.control?.outcomeKind !== question.outcomeDefinition ||
    payload.control.version !== question.resolutionRuleVersion ||
    (question.raceId !== null &&
      (payload.races.length !== 1 ||
        payload.races[0]?.raceId !== question.raceId))
  )
    throw new Error("Reviewed structure does not define this question");
  const raceIds = payload.races.map((race) => race.raceId);
  if (raceIds.length < 1 || raceIds.length > 500)
    throw new Error("Reviewed race count exceeds model bounds");
  return { question, payload, raceIds };
}

/** One explicit DB read of reviewed inputs. A later run transaction rechecks every reference. */
export async function buildReviewedModelSnapshot(db: Database, raw: unknown) {
  const input = requestSchema.parse(raw);
  const asOf = new Date(input.inputAsOf);
  const { question, payload, raceIds } = await loadReviewedContext(
    db,
    input,
    asOf,
  );
  const candidateQuery = sql`
    WITH eligible_polls AS (
      SELECT DISTINCT l0.poll_id
      FROM poll_edition_links l0
      WHERE l0.edition_id = ${input.scope.editionId}
        AND l0.race_id IN (${sql.join(
          raceIds.map((id) => sql`${id}`),
          sql`, `,
        )})
        AND l0.created_at <= ${asOf}
    ),
    latest_revisions AS (
      SELECT DISTINCT ON (r.poll_id) r.*
      FROM eligible_polls ep
      JOIN poll_revisions r ON r.poll_id = ep.poll_id
      WHERE r.sealed = true AND r.acquired_at <= ${asOf}
      ORDER BY r.poll_id, r.revision_no DESC
    )
    SELECT r.id AS revision_id, l.id AS link_id, l.race_id,
           r.pollster, r.fieldwork_end::text AS fieldwork_end,
           FLOOR(EXTRACT(EPOCH FROM r.acquired_at) * 1000) AS acquired_epoch_ms,
           q.external_question_id, q.sample_group_id, q.population_kind, q.sample_size,
           m.id AS mapping_id, m.positive_option_id, m.negative_option_id,
           m.positive_party_id, m.negative_party_id,
           m.positive_caucus_id, m.negative_caucus_id,
           positive.percentage::text AS positive_percentage,
           negative.percentage::text AS negative_percentage
    FROM latest_revisions r
    JOIN configured_sources s ON s.id = r.source_id AND s.excluded_from_forecasts = false
    JOIN poll_edition_links l ON l.poll_id = r.poll_id
      AND l.edition_id = ${input.scope.editionId}
      AND l.race_id IN (${sql.join(
        raceIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      AND l.created_at <= ${asOf}
    JOIN poll_questions q ON q.revision_id = r.id AND q.kind = 'vote_intent'
    JOIN LATERAL (
      SELECT * FROM poll_model_option_mappings m0
      WHERE m0.revision_id = r.id
        AND m0.external_question_id = q.external_question_id
        AND m0.race_id = l.race_id
      ORDER BY m0.reviewed_at DESC, m0.id DESC LIMIT 1
    ) m ON m.reviewed_at <= ${asOf}
    JOIN poll_options positive ON positive.revision_id = r.id
      AND positive.external_question_id = q.external_question_id
      AND positive.option_id = m.positive_option_id
    JOIN poll_options negative ON negative.revision_id = r.id
      AND negative.external_question_id = q.external_question_id
      AND negative.option_id = m.negative_option_id
    LEFT JOIN LATERAL (
      SELECT e.excluded FROM poll_forecast_exclusions e
      WHERE e.poll_id = r.poll_id AND e.edition_id = l.edition_id
      ORDER BY e.recorded_at DESC, e.id DESC LIMIT 1
    ) exclusion ON true
    LEFT JOIN LATERAL (
      SELECT d.included FROM poll_link_decisions d
      WHERE d.poll_link_id = l.id
      ORDER BY d.recorded_at DESC, d.id DESC LIMIT 1
    ) decision ON true
    WHERE COALESCE(exclusion.excluded, false) = false
      AND COALESCE(decision.included, true) = true
    ORDER BY r.acquired_at DESC, r.id, l.id, q.external_question_id
    LIMIT 501`;
  const result = await db.execute(candidateQuery);
  if (result.rows.length === 0)
    throw new Error("No reviewed poll inputs are eligible");
  if (result.rows.length > 500)
    throw new Error("Reviewed poll input budget exceeded");
  const seenRevisions = new Set<string>();
  const polls = result.rows.map((rawRow) => {
    const row = candidateSchema.parse(rawRow);
    if (seenRevisions.has(row.revision_id))
      throw new Error("Multiple mapped questions share one poll revision");
    seenRevisions.add(row.revision_id);
    const race = payload.races.find((item) => item.raceId === row.race_id);
    if (
      !race ||
      row.positive_party_id !== race.positive.partyId ||
      row.negative_party_id !== race.negative.partyId ||
      row.positive_caucus_id !== race.positive.caucusId ||
      row.negative_caucus_id !== race.negative.caucusId
    )
      throw new Error(
        "Latest option mapping differs from reviewed race orientation",
      );
    return {
      signalId: `${row.revision_id}:${row.link_id}`,
      revisionId: row.revision_id,
      pollLinkId: row.link_id,
      optionMappingId: row.mapping_id,
      externalQuestionId: row.external_question_id,
      positiveOptionId: row.positive_option_id,
      negativeOptionId: row.negative_option_id,
      raceId: row.race_id,
      pollsterId: row.pollster,
      sampleGroupId: row.sample_group_id,
      population: row.population_kind,
      sampleSize: row.sample_size,
      quality: 1,
      observedEndDate: row.fieldwork_end,
      acquiredAt: new Date(row.acquired_epoch_ms).toISOString(),
      availableAt: new Date(row.acquired_epoch_ms).toISOString(),
      availability: "actual_acquisition" as const,
      marginPoints:
        Number(row.positive_percentage) - Number(row.negative_percentage),
    };
  });
  const snapshot = parseModelSnapshot({
    questionId: input.questionId,
    scope: input.scope,
    kind: input.kind,
    inputAsOf: input.inputAsOf,
    cutoffAt: question.cutoffAt.toISOString(),
    catalogVersion: payload.catalogVersion,
    structuralReferenceId: input.structuralReferenceId,
    qualityPolicyVersion: "poll-quality-v1",
    modelVersion: input.modelVersion,
    parameterVersion: input.parameters.version,
    parameters: input.parameters,
    seed: input.seed,
    races: payload.races,
    polls,
    control: payload.control,
  });
  if (aggregateRaces(snapshot).diagnostics.quality !== "complete")
    throw new Error("Reviewed model inputs are incomplete");
  return snapshot;
}
