import { and, desc, eq, sql } from "drizzle-orm";
import { structuralReferencePayloadSchema } from "../../elections/model/snapshot-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import type { ModelSnapshot } from "../../elections/model/contracts";
import type { Database } from "./client";
import {
  pollEditionLinks,
  pollForecastExclusions,
  pollLinkDecisions,
  pollModelOptionMappings,
  pollOptions,
  pollQuestions,
  pollRevisions,
  structuralModelReferences,
} from "./schema";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type PollSignal = ModelSnapshot["polls"][number];

async function verifyStructuralReference(
  tx: DatabaseTransaction,
  snapshot: ModelSnapshot,
  asOf: Date,
) {
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
}

function verifyInputList(
  snapshot: ModelSnapshot,
  pollInputs: readonly { revisionId: string; pollLinkId: string }[],
) {
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
}

async function verifyPollEligibility(
  tx: DatabaseTransaction,
  snapshot: ModelSnapshot,
  poll: PollSignal,
  asOf: Date,
) {
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
  return revision;
}

async function verifyOptionOrientation(
  tx: DatabaseTransaction,
  snapshot: ModelSnapshot,
  poll: PollSignal,
  asOf: Date,
) {
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
        eq(pollModelOptionMappings.externalQuestionId, poll.externalQuestionId),
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
    throw new Error("Poll option orientation lacks matching reviewed evidence");
}

async function verifyRawPollValues(
  tx: DatabaseTransaction,
  poll: PollSignal,
  revision: typeof pollRevisions.$inferSelect,
) {
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

export async function verifyModelEvidence(
  tx: DatabaseTransaction,
  snapshot: ModelSnapshot,
  pollInputs: readonly { revisionId: string; pollLinkId: string }[],
) {
  if (snapshot.polls.length === 0 || snapshot.polls.length > 500)
    throw new Error("Model poll verification budget or minimum was not met");
  const asOf = new Date(snapshot.inputAsOf);
  await verifyStructuralReference(tx, snapshot, asOf);
  verifyInputList(snapshot, pollInputs);
  for (const poll of snapshot.polls) {
    const revision = await verifyPollEligibility(tx, snapshot, poll, asOf);
    await verifyOptionOrientation(tx, snapshot, poll, asOf);
    await verifyRawPollValues(tx, poll, revision);
  }
}
