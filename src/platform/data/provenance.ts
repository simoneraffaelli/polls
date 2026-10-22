import { z } from "zod";
import { calendarDateSchema, contentHashSchema, internalIdSchema, publicHttpUrlSchema, utcInstantSchema } from "./primitives";

export const observedPeriodSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), date: calendarDateSchema }),
  z.object({ kind: z.literal("date_period"), startDate: calendarDateSchema, endDate: calendarDateSchema }).refine(
    ({ startDate, endDate }) => startDate <= endDate,
    { message: "Observed period ends before it starts", path: ["endDate"] },
  ),
  z.object({ kind: z.literal("instant"), at: utcInstantSchema }),
]);

export const declaredPublicationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), date: calendarDateSchema }),
  z.object({ kind: z.literal("instant"), at: utcInstantSchema }),
]);

/** A normalized acquisition has no database revision ID until persisted. */
export const observationProvenanceSchema = z.object({
  sourceId: z.uuid(),
  sourceUrl: publicHttpUrlSchema,
  externalId: internalIdSchema,
  sourceRevision: internalIdSchema.nullable(),
  observed: observedPeriodSchema,
  declaredPublication: declaredPublicationSchema.nullable(),
  acquiredAt: utcInstantSchema,
  ingestionRunId: z.uuid(),
  parserVersion: internalIdSchema,
  transformationVersion: internalIdSchema,
  contentHash: contentHashSchema,
}).superRefine(({ declaredPublication, acquiredAt }, context) => {
  if (declaredPublication?.kind === "instant" && Date.parse(declaredPublication.at) > Date.parse(acquiredAt)) {
    context.addIssue({ code: "custom", message: "Publication is later than acquisition", path: ["declaredPublication"] });
  }
});

/** Database-assigned identity; corrections insert a new revision instead of overwriting. */
export const revisionIdentitySchema = z.object({
  entityId: z.uuid(),
  revisionId: z.uuid(),
  supersedesRevisionId: z.uuid().nullable(),
}).refine(
  ({ revisionId, supersedesRevisionId }) => revisionId !== supersedesRevisionId,
  { message: "A revision cannot supersede itself", path: ["supersedesRevisionId"] },
);

export type ObservationProvenance = z.infer<typeof observationProvenanceSchema>;
export type RevisionIdentity = z.infer<typeof revisionIdentitySchema>;
