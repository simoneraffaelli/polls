import { z } from "zod";
import { observationProvenanceSchema } from "../../platform/data/provenance";
import { internalIdSchema } from "../../platform/data/primitives";

const populationSchema = z.object({
  kind: z.enum(["adults", "registered_voters", "likely_voters", "other"]),
  description: internalIdSchema,
});

const pollOptionSchema = z.object({
  optionId: internalIdSchema,
  label: internalIdSchema,
  percentage: z.number().finite().min(0).max(100),
});

const pollQuestionSchema = z
  .object({
    questionId: internalIdSchema,
    wording: internalIdSchema.nullable(),
    kind: z.enum([
      "vote_intent",
      "generic_ballot",
      "approval",
      "favorability",
      "other",
    ]),
    population: populationSchema,
    /** Questions sharing respondents keep the same group even when RV/LV cuts differ. */
    sampleGroupId: internalIdSchema,
    sampleSize: z.number().int().positive().nullable(),
    options: z.array(pollOptionSchema).min(1),
  })
  .superRefine(({ options }, context) => {
    if (
      new Set(options.map(({ optionId }) => optionId)).size !== options.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Duplicate poll option ID",
        path: ["options"],
      });
    }
  });

/** One poll may contain several questions and overlapping samples. */
export const pollObservationSchema = z
  .object({
    provenance: observationProvenanceSchema,
    pollster: internalIdSchema,
    sponsors: z.array(internalIdSchema),
    questions: z.array(pollQuestionSchema).min(1),
  })
  .superRefine(({ provenance, questions }, context) => {
    if (provenance.observed.kind !== "date_period") {
      context.addIssue({
        code: "custom",
        message: "A poll needs its fieldwork date period",
        path: ["provenance", "observed"],
      });
    }
    if (
      new Set(questions.map(({ questionId }) => questionId)).size !==
      questions.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Duplicate poll question ID",
        path: ["questions"],
      });
    }
  });

export type PollObservation = z.infer<typeof pollObservationSchema>;
