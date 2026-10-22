import { z } from "zod";
import {
  calendarDateSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { ModelSnapshot } from "./contracts";
import { aggregateRaces } from "./aggregate";

const id = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim());
const fraction = z.number().min(0).max(1);
const margin = z.number().min(-100).max(100);
const outcome = z.strictObject({ partyId: id, caucusId: id.nullable() });

/** JSON boundaries must validate booleans and enums instead of trusting TypeScript casts. */
export const modelSnapshotSchema = z.strictObject({
  questionId: id,
  scope: z.strictObject({ sectionId: id, editionId: id }),
  kind: z.enum(["forecast", "retrospective_reconstruction"]),
  inputAsOf: utcInstantSchema,
  cutoffAt: utcInstantSchema,
  catalogVersion: id,
  structuralReferenceId: z.uuid(),
  qualityPolicyVersion: z.literal("poll-quality-v1"),
  modelVersion: id,
  parameterVersion: id,
  parameters: z.strictObject({
    version: id,
    halfLifeDays: z.number().min(1).max(365),
    sampleCap: z.number().int().min(1).max(100_000),
    pollSdAtWeightOne: z.number().min(0.1).max(100),
    missingPollSdMultiplier: z.number().min(1).max(10),
    nationalErrorSd: z.number().min(0).max(50),
    regionalErrorSd: z.number().min(0).max(50),
    localErrorSd: z.number().min(0).max(50),
    populationWeights: z.strictObject({
      likely_voters: fraction,
      registered_voters: fraction,
      adults: fraction,
      other: fraction,
    }),
  }),
  seed: id,
  races: z
    .array(
      z.strictObject({
        raceId: id,
        regionId: id,
        priorMarginPoints: margin,
        priorSdPoints: z.number().min(0.01).max(100),
        priorAvailableAt: utcInstantSchema,
        priorVersion: id,
        structuralStatus: z.enum(["verified", "assumed"]),
        mapVersion: id.nullable(),
        resolutionRuleVersion: id,
        binaryResolutionVerified: z.boolean(),
        positive: outcome,
        negative: outcome,
      }),
    )
    .min(1)
    .max(500),
  polls: z
    .array(
      z.strictObject({
        signalId: id,
        revisionId: id,
        pollLinkId: z.uuid(),
        optionMappingId: z.uuid(),
        externalQuestionId: id,
        positiveOptionId: id,
        negativeOptionId: id,
        raceId: id,
        pollsterId: id,
        sampleGroupId: id,
        population: z.enum([
          "likely_voters",
          "registered_voters",
          "adults",
          "other",
        ]),
        sampleSize: z.number().int().positive().max(10_000_000).nullable(),
        quality: fraction,
        observedEndDate: calendarDateSchema,
        acquiredAt: utcInstantSchema,
        availableAt: utcInstantSchema,
        availability: z.enum([
          "actual_acquisition",
          "documented_historical",
          "assumed_historical",
        ]),
        marginPoints: margin,
      }),
    )
    .max(10_000),
  control: z
    .strictObject({
      version: id,
      outcomeKind: z.enum(["seat_majority", "chamber_control"]),
      resolutionRuleVerified: z.boolean(),
      totalSeats: z.number().int().min(1).max(500),
      majorityThreshold: z.number().int().min(1).max(500),
      holdovers: z
        .array(
          z.strictObject({
            partyId: id,
            caucusId: id.nullable(),
            count: z.number().int().min(0).max(500),
          }),
        )
        .max(500),
      holdoversAsOf: utcInstantSchema,
      holdoversVerified: z.boolean(),
      tieAt: z.number().int().min(0).max(250).nullable(),
      tieBreakerCaucusId: id.nullable(),
      tieRuleVerified: z.boolean(),
    })
    .nullable(),
}) satisfies z.ZodType<ModelSnapshot>;

/** The reviewed structural payload uses exactly the snapshot's race and rule contracts. */
export const structuralReferencePayloadSchema = modelSnapshotSchema.pick({
  catalogVersion: true,
  races: true,
  control: true,
});
export type StructuralReferencePayload = z.infer<
  typeof structuralReferencePayloadSchema
>;

export function parseModelSnapshot(raw: unknown): ModelSnapshot {
  const snapshot = modelSnapshotSchema.parse(raw);
  aggregateRaces(snapshot); // Cross-field, chronology and orientation invariants.
  return snapshot;
}
