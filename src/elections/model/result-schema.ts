import { z } from "zod";
import type { ModelResult } from "./contracts";

const id = z.string().min(1).max(200);
const finite = z.number().finite();
const probability = finite.min(0).max(1);
const seat = finite.min(0).max(500);

const outcome = z.strictObject({ partyId: id, caucusId: id.nullable() });
const race = z.strictObject({
  raceId: id,
  regionId: id,
  meanMarginPoints: finite.min(-100).max(100),
  posteriorSdPoints: finite.min(0).max(1000),
  effectivePollWeight: finite.min(0).max(100_000),
  pollGroups: z.number().int().min(0).max(10_000),
  hasLocalPolls: z.boolean(),
  positive: outcome,
  negative: outcome,
});
const seats = z
  .strictObject({
    id,
    mean: seat,
    lower80: seat,
    upper80: seat,
  })
  .refine((value) => value.lower80 <= value.upper80, "Invalid seat interval");

export const modelResultSchema = z
  .strictObject({
    modelStatus: z.literal("experimental"),
    parametersVersion: id,
    seed: id,
    iterations: z.number().int().min(100).max(20_000),
    diagnostics: z.strictObject({
      quality: z.enum(["complete", "incomplete"]),
      issues: z.array(id).max(100),
      warnings: z.array(id).max(100),
      modeledRaces: z.number().int().min(1).max(500),
      expectedContestedSeats: z.number().int().min(0).max(500).nullable(),
      racesWithLocalPolls: z.number().int().min(0).max(500),
      assumedInputs: z.number().int().min(0).max(10_500),
    }),
    races: z.array(race).min(1).max(500),
    raceWinProbabilities: z
      .array(z.strictObject({ raceId: id, positiveProbability: probability }))
      .min(1)
      .max(500),
    partySeats: z.array(seats).max(500),
    caucusSeats: z.array(seats).max(500),
    questionOutcomeKind: z
      .enum(["seat_majority", "chamber_control"])
      .nullable(),
    questionOutcomeProbabilities: z
      .array(z.strictObject({ outcomeId: id, probability }))
      .max(500),
  })
  .superRefine((result, context) => {
    const raceIds = new Set(result.races.map((entry) => entry.raceId));
    const winIds = result.raceWinProbabilities.map((entry) => entry.raceId);
    if (
      raceIds.size !== result.races.length ||
      winIds.length !== raceIds.size ||
      new Set(winIds).size !== winIds.length ||
      winIds.some((id) => !raceIds.has(id))
    ) {
      context.addIssue({
        code: "custom",
        message: "Race probabilities do not match model races",
      });
    }
    if (
      result.diagnostics.modeledRaces !== result.races.length ||
      result.diagnostics.racesWithLocalPolls > result.races.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Diagnostics do not match model races",
      });
    }
    if (
      result.questionOutcomeProbabilities.length &&
      (result.questionOutcomeKind === null ||
        result.diagnostics.quality !== "complete" ||
        Math.abs(
          result.questionOutcomeProbabilities.reduce(
            (sum, entry) => sum + entry.probability,
            0,
          ) - 1,
        ) > 1e-9)
    ) {
      context.addIssue({
        code: "custom",
        message: "Question outcome distribution is inconsistent",
      });
    }
    if (
      new Set(
        result.questionOutcomeProbabilities.map((entry) => entry.outcomeId),
      ).size !== result.questionOutcomeProbabilities.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Duplicate question outcome",
      });
    }
  });

export function parseModelResult(raw: unknown): ModelResult {
  return modelResultSchema.parse(raw);
}
