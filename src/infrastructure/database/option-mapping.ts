import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { structuralReferencePayloadSchema } from "../../elections/model/snapshot-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import { internalIdSchema } from "../../platform/data/primitives";
import type { Database } from "./client";
import {
  adminAudit,
  pollModelOptionMappings,
  pollOptions,
  pollRevisions,
  structuralModelReferences,
} from "./schema";

const requestSchema = z.strictObject({
  structuralReferenceId: z.uuid(),
  revisionId: z.uuid(),
  externalQuestionId: internalIdSchema,
  raceId: z.uuid(),
  positiveOptionId: internalIdSchema,
  negativeOptionId: internalIdSchema,
  reviewerUserId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

/** Explicit option semantics: never infer a political side from a free-form label. */
export async function registerPollOptionMapping(db: Database, raw: unknown) {
  const input = requestSchema.parse(raw);
  if (input.positiveOptionId === input.negativeOptionId)
    throw new Error("Mapping requires two distinct poll options");
  return db.transaction(async (tx) => {
    const member = await tx.execute(
      sql`SELECT user_id FROM admin_memberships WHERE user_id = ${input.reviewerUserId} AND revoked_at IS NULL FOR SHARE`,
    );
    if (member.rows.length !== 1)
      throw new Error("Option mapping reviewer is not an active administrator");
    const [reference] = await tx
      .select()
      .from(structuralModelReferences)
      .where(eq(structuralModelReferences.id, input.structuralReferenceId));
    if (!reference) throw new Error("Reviewed structural reference is missing");
    const payload = structuralReferencePayloadSchema.parse(reference.payload);
    if ((await snapshotDigest(payload)) !== reference.contentHash)
      throw new Error(
        "Reviewed structural reference hash differs from payload",
      );
    const race = payload.races.find((item) => item.raceId === input.raceId);
    if (!race)
      throw new Error("Mapped race is not in reviewed structural reference");
    const [revision] = await tx
      .select({ sealed: pollRevisions.sealed, pollId: pollRevisions.pollId })
      .from(pollRevisions)
      .where(eq(pollRevisions.id, input.revisionId));
    if (!revision?.sealed)
      throw new Error("Option mapping requires a sealed poll revision");
    await tx.execute(
      sql`SELECT id FROM poll_records WHERE id = ${revision.pollId} FOR UPDATE`,
    );
    const options = await tx
      .select({ id: pollOptions.optionId })
      .from(pollOptions)
      .where(
        and(
          eq(pollOptions.revisionId, input.revisionId),
          eq(pollOptions.externalQuestionId, input.externalQuestionId),
        ),
      );
    if (
      !options.some((option) => option.id === input.positiveOptionId) ||
      !options.some((option) => option.id === input.negativeOptionId)
    )
      throw new Error("Option mapping refers to unknown raw options");
    const [latest] = await tx
      .select()
      .from(pollModelOptionMappings)
      .where(
        and(
          eq(pollModelOptionMappings.revisionId, input.revisionId),
          eq(
            pollModelOptionMappings.externalQuestionId,
            input.externalQuestionId,
          ),
          eq(pollModelOptionMappings.raceId, input.raceId),
        ),
      )
      .orderBy(
        desc(pollModelOptionMappings.reviewedAt),
        desc(pollModelOptionMappings.id),
      )
      .limit(1);
    if (
      latest &&
      latest.positiveOptionId === input.positiveOptionId &&
      latest.negativeOptionId === input.negativeOptionId &&
      latest.positivePartyId === race.positive.partyId &&
      latest.negativePartyId === race.negative.partyId &&
      latest.positiveCaucusId === race.positive.caucusId &&
      latest.negativeCaucusId === race.negative.caucusId
    )
      return { id: latest.id, repeated: true };
    const [registered] = await tx
      .insert(pollModelOptionMappings)
      .values({
        revisionId: input.revisionId,
        externalQuestionId: input.externalQuestionId,
        raceId: input.raceId,
        positiveOptionId: input.positiveOptionId,
        negativeOptionId: input.negativeOptionId,
        positivePartyId: race.positive.partyId,
        negativePartyId: race.negative.partyId,
        positiveCaucusId: race.positive.caucusId,
        negativeCaucusId: race.negative.caucusId,
        reviewedBy: input.reviewerUserId,
        reason: input.reason,
      })
      .returning({ id: pollModelOptionMappings.id });
    if (!registered) throw new Error("Option mapping insert failed");
    await tx.insert(adminAudit).values({
      actorUserId: input.reviewerUserId,
      action: "poll_model_mapping.review",
      targetType: "poll_model_option_mapping",
      targetId: registered.id,
      reason: input.reason,
    });
    return { id: registered.id, repeated: false };
  });
}
