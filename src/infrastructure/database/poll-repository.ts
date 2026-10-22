import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { pollObservationSchema } from "../../elections/polling/poll";
import { editionScopeSchema } from "../../platform/data/primitives";
import type { Database } from "./client";
import {
  editions,
  pollAcquisitions,
  pollEditionLinks,
  pollOptions,
  pollQuestions,
  pollRecords,
  pollRevisions,
} from "./schema";

const associationSchema = z.object({
  scope: editionScopeSchema,
  raceId: z.uuid().nullable().default(null),
});
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

function publicationFields(
  value: z.infer<
    typeof pollObservationSchema
  >["provenance"]["declaredPublication"],
) {
  return {
    declaredPublicationKind: value?.kind ?? null,
    declaredPublicationDate: value?.kind === "date" ? value.date : null,
    declaredPublicationAt:
      value?.kind === "instant" ? new Date(value.at) : null,
  } as const;
}

/** Each source-run receipt is durable; a later retry cannot masquerade as a correction. */
export async function recordPollRevision(
  db: Database,
  observation: unknown,
  association: unknown,
): Promise<{
  pollId: string;
  revisionId: string;
  linkId: string;
  revisionNo: number;
  created: boolean;
}> {
  return db.transaction((tx) =>
    recordPollRevisionInTransaction(tx, observation, association),
  );
}

/** Intended for a larger page transaction that also advances the source cursor. */
export async function recordPollRevisionInTransaction(
  tx: DatabaseTransaction,
  observation: unknown,
  association: unknown,
): Promise<{
  pollId: string;
  revisionId: string;
  linkId: string;
  revisionNo: number;
  created: boolean;
}> {
  const poll = pollObservationSchema.parse(observation);
  const link = associationSchema.parse(association);
  const observed = poll.provenance.observed;
  if (observed.kind !== "date_period")
    throw new Error("Poll fieldwork period required");
  {
    const [edition] = await tx
      .select({ id: editions.id })
      .from(editions)
      .where(
        and(
          eq(editions.id, link.scope.editionId),
          eq(editions.sectionId, link.scope.sectionId),
        ),
      );
    if (!edition) throw new Error("Edition does not belong to section");

    await tx
      .insert(pollRecords)
      .values({
        sourceId: poll.provenance.sourceId,
        externalId: poll.provenance.externalId,
      })
      .onConflictDoNothing();
    const [record] = await tx
      .select()
      .from(pollRecords)
      .where(
        and(
          eq(pollRecords.sourceId, poll.provenance.sourceId),
          eq(pollRecords.externalId, poll.provenance.externalId),
        ),
      );
    if (!record) throw new Error("Poll record could not be loaded");
    await tx.execute(
      sql`SELECT id FROM poll_records WHERE id = ${record.id} FOR UPDATE`,
    );

    const [receipt] = await tx
      .select()
      .from(pollAcquisitions)
      .where(
        and(
          eq(pollAcquisitions.pollId, record.id),
          eq(pollAcquisitions.ingestionRunId, poll.provenance.ingestionRunId),
        ),
      );
    const sameFingerprint = (stored: {
      contentHash: string;
      sourceRevision: string | null;
      sourceUrl: string;
      parserVersion: string;
      transformVersion: string;
    }) =>
      stored.contentHash === poll.provenance.contentHash &&
      stored.sourceRevision === poll.provenance.sourceRevision &&
      stored.sourceUrl === poll.provenance.sourceUrl &&
      stored.parserVersion === poll.provenance.parserVersion &&
      stored.transformVersion === poll.provenance.transformationVersion;
    if (receipt && !sameFingerprint(receipt))
      throw new Error("Conflicting replay for poll acquisition run");

    const [latest] = await tx
      .select()
      .from(pollRevisions)
      .where(eq(pollRevisions.pollId, record.id))
      .orderBy(desc(pollRevisions.revisionNo))
      .limit(1);
    const [latestAcquisition] = await tx
      .select()
      .from(pollAcquisitions)
      .where(eq(pollAcquisitions.pollId, record.id))
      .orderBy(desc(pollAcquisitions.acquiredAt), desc(pollAcquisitions.id))
      .limit(1);
    if (
      !receipt &&
      latestAcquisition &&
      new Date(poll.provenance.acquiredAt).getTime() <
        latestAcquisition.acquiredAt.getTime()
    ) {
      throw new Error("Stale poll acquisition cannot change latest revision");
    }
    if (
      !receipt &&
      latestAcquisition &&
      new Date(poll.provenance.acquiredAt).getTime() ===
        latestAcquisition.acquiredAt.getTime() &&
      !sameFingerprint(latestAcquisition)
    ) {
      throw new Error("Conflicting poll acquisition at the same instant");
    }
    const createRevision = !receipt && (!latest || !sameFingerprint(latest));
    let revisionId: string;
    let revisionNo: number;
    if (!createRevision) {
      const chosenRevisionId = receipt?.revisionId ?? latest?.id;
      if (!chosenRevisionId)
        throw new Error("Poll revision could not be loaded");
      const [chosen] = await tx
        .select({ id: pollRevisions.id, revisionNo: pollRevisions.revisionNo })
        .from(pollRevisions)
        .where(eq(pollRevisions.id, chosenRevisionId));
      if (!chosen) throw new Error("Poll revision could not be loaded");
      revisionId = chosen.id;
      revisionNo = chosen.revisionNo;
    } else {
      revisionNo = (latest?.revisionNo ?? 0) + 1;
      const [revision] = await tx
        .insert(pollRevisions)
        .values({
          pollId: record.id,
          sourceId: poll.provenance.sourceId,
          revisionNo,
          supersedesRevisionId: latest?.id ?? null,
          sourceRevision: poll.provenance.sourceRevision,
          contentHash: poll.provenance.contentHash,
          sourceUrl: poll.provenance.sourceUrl,
          pollster: poll.pollster,
          sponsors: poll.sponsors,
          fieldworkStart: observed.startDate,
          fieldworkEnd: observed.endDate,
          ...publicationFields(poll.provenance.declaredPublication),
          acquiredAt: new Date(poll.provenance.acquiredAt),
          parserVersion: poll.provenance.parserVersion,
          transformVersion: poll.provenance.transformationVersion,
          ingestionRunId: poll.provenance.ingestionRunId,
        })
        .returning({ id: pollRevisions.id });
      if (!revision) throw new Error("Poll revision insert returned no row");
      revisionId = revision.id;
      await tx.insert(pollQuestions).values(
        poll.questions.map((question) => ({
          revisionId,
          externalQuestionId: question.questionId,
          wording: question.wording,
          kind: question.kind,
          populationKind: question.population.kind,
          populationDescription: question.population.description,
          sampleGroupId: question.sampleGroupId,
          sampleSize: question.sampleSize,
        })),
      );
      await tx.insert(pollOptions).values(
        poll.questions.flatMap((question) =>
          question.options.map((option) => ({
            revisionId,
            externalQuestionId: question.questionId,
            optionId: option.optionId,
            label: option.label,
            percentage: option.percentage.toString(),
          })),
        ),
      );
      await tx
        .update(pollRevisions)
        .set({ sealed: true })
        .where(eq(pollRevisions.id, revisionId));
    }

    if (!receipt) {
      await tx.insert(pollAcquisitions).values({
        pollId: record.id,
        sourceId: poll.provenance.sourceId,
        ingestionRunId: poll.provenance.ingestionRunId,
        revisionId,
        sourceRevision: poll.provenance.sourceRevision,
        contentHash: poll.provenance.contentHash,
        sourceUrl: poll.provenance.sourceUrl,
        parserVersion: poll.provenance.parserVersion,
        transformVersion: poll.provenance.transformationVersion,
        acquiredAt: new Date(poll.provenance.acquiredAt),
      });
    }

    await tx
      .insert(pollEditionLinks)
      .values({
        pollId: record.id,
        editionId: link.scope.editionId,
        raceId: link.raceId,
      })
      .onConflictDoNothing();
    const [associationRow] = await tx
      .select({ id: pollEditionLinks.id })
      .from(pollEditionLinks)
      .where(
        and(
          eq(pollEditionLinks.pollId, record.id),
          eq(pollEditionLinks.editionId, link.scope.editionId),
          link.raceId
            ? eq(pollEditionLinks.raceId, link.raceId)
            : isNull(pollEditionLinks.raceId),
        ),
      );
    if (!associationRow)
      throw new Error("Poll association could not be loaded");
    return {
      pollId: record.id,
      revisionId,
      linkId: associationRow.id,
      revisionNo,
      created: createRevision,
    };
  }
}
