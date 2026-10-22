import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { structuralReferencePayloadSchema } from "../../elections/model/snapshot-schema";
import { snapshotDigest } from "../../elections/model/snapshot-hash";
import {
  editionScopeSchema,
  internalIdSchema,
  publicHttpUrlSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { Database } from "./client";
import {
  adminAudit,
  editions,
  forecastQuestions,
  races,
  structuralModelReferences,
} from "./schema";

const registrationSchema = z.strictObject({
  questionId: z.uuid(),
  scope: editionScopeSchema,
  version: internalIdSchema,
  sourceUrl: publicHttpUrlSchema.refine(
    (value) => new URL(value).protocol === "https:",
    "Reviewed structural evidence requires HTTPS",
  ),
  sourceVersion: internalIdSchema,
  availableAt: utcInstantSchema,
  payload: structuralReferencePayloadSchema,
  reviewerUserId: z.string().min(1),
});

/** Local controlled registration. This is an admin attestation, not an automatic prior generator. */
export async function registerStructuralReference(db: Database, raw: unknown) {
  const input = registrationSchema.parse(raw);
  const hash = await snapshotDigest(input.payload);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM forecast_questions WHERE id = ${input.questionId} FOR UPDATE`,
    );
    const [question] = await tx
      .select({ id: forecastQuestions.id })
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
      throw new Error("Structural reference question scope is invalid");
    const member = await tx.execute(
      sql`SELECT user_id FROM admin_memberships WHERE user_id = ${input.reviewerUserId} AND revoked_at IS NULL FOR SHARE`,
    );
    if (member.rows.length !== 1)
      throw new Error("Structural reviewer is not an active administrator");
    const [existing] = await tx
      .select({
        id: structuralModelReferences.id,
        contentHash: structuralModelReferences.contentHash,
        sourceUrl: structuralModelReferences.sourceUrl,
        sourceVersion: structuralModelReferences.sourceVersion,
        availableAt: structuralModelReferences.availableAt,
      })
      .from(structuralModelReferences)
      .where(
        and(
          eq(structuralModelReferences.questionId, input.questionId),
          eq(structuralModelReferences.version, input.version),
        ),
      );
    if (existing) {
      if (
        existing.contentHash !== hash ||
        existing.sourceUrl !== input.sourceUrl ||
        existing.sourceVersion !== input.sourceVersion ||
        existing.availableAt.getTime() !== new Date(input.availableAt).getTime()
      )
        throw new Error("Structural version already names different content");
      return { id: existing.id, repeated: true };
    }
    const observed = await tx.execute(
      sql`SELECT EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS epoch_ms`,
    );
    const now = new Date(Number(observed.rows[0]?.epoch_ms));
    if (Number.isNaN(now.getTime()) || new Date(input.availableAt) > now)
      throw new Error("Structural source availability is in the future");
    for (const race of input.payload.races) {
      if (new Date(race.priorAvailableAt) > new Date(input.availableAt))
        throw new Error("Race prior is later than source availability");
      if (!z.uuid().safeParse(race.raceId).success)
        throw new Error("Race must use its database identity");
      const [record] = await tx
        .select({ id: races.id })
        .from(races)
        .where(
          and(
            eq(races.id, race.raceId),
            eq(races.editionId, input.scope.editionId),
          ),
        );
      if (!record)
        throw new Error("Structural race is outside question edition");
    }
    if (
      input.payload.control &&
      new Date(input.payload.control.holdoversAsOf) >
        new Date(input.availableAt)
    )
      throw new Error("Holdover snapshot is later than source availability");
    const [registered] = await tx
      .insert(structuralModelReferences)
      .values({
        questionId: input.questionId,
        editionId: input.scope.editionId,
        version: input.version,
        schemaVersion: "structural-v1",
        sourceUrl: input.sourceUrl,
        sourceVersion: input.sourceVersion,
        availableAt: new Date(input.availableAt),
        acquiredAt: now,
        contentHash: hash,
        payload: input.payload,
        reviewedBy: input.reviewerUserId,
      })
      .returning({ id: structuralModelReferences.id });
    if (!registered) throw new Error("Structural reference insert failed");
    await tx.insert(adminAudit).values({
      actorUserId: input.reviewerUserId,
      action: "structural_reference.review",
      targetType: "structural_model_reference",
      targetId: registered.id,
      reason: `Source version ${input.sourceVersion}`,
    });
    return { id: registered.id, repeated: false };
  });
}
