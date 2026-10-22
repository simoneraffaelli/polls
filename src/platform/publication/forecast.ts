import { z } from "zod";
import {
  contentHashSchema,
  editionScopeSchema,
  internalIdSchema,
  sameEditionScope,
  utcInstantSchema,
} from "../data/primitives";

const localDateTimeSchema = z.iso
  .datetime({ local: true })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);

function localTimeAt(utcInstant: string, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcInstant));
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  } catch {
    return null;
  }
}

export const forecastCutoffSchema = z
  .object({
    version: z.number().int().positive(),
    localDateTime: localDateTimeSchema,
    timeZone: internalIdSchema,
    utcInstant: utcInstantSchema,
    calendarReference: z.url().startsWith("https://"),
  })
  .refine(
    ({ utcInstant, timeZone, localDateTime }) =>
      localTimeAt(utcInstant, timeZone) === localDateTime,
    {
      message: "Cutoff local time and UTC instant disagree",
      path: ["localDateTime"],
    },
  );

const publishedForecastSchema = z
  .object({
    runId: z.uuid(),
    runSequence: z.number().int().positive(),
    inputAsOf: utcInstantSchema,
    publishedAt: utcInstantSchema,
    cutoffVersion: z.number().int().positive(),
    cutoffAtPublication: utcInstantSchema,
  })
  .refine(
    ({ publishedAt, cutoffAtPublication }) =>
      Date.parse(publishedAt) < Date.parse(cutoffAtPublication),
    {
      message: "A forecast cannot be published at or after its cutoff",
      path: ["publishedAt"],
    },
  );

export const forecastQuestionSchema = z
  .object({
    questionId: z.uuid(),
    scope: editionScopeSchema,
    outcomeDefinition: internalIdSchema,
    resolutionRuleVersion: internalIdSchema,
    cutoff: forecastCutoffSchema,
    storedState: z.enum(["open", "closed", "archived"]),
    latestPublished: publishedForecastSchema.nullable(),
    frozenRunId: z.uuid().nullable(),
    resolutionStatus: z.enum(["pending", "verified"]),
    verifiedOutcomeId: internalIdSchema.nullable(),
  })
  .superRefine(
    (
      {
        latestPublished,
        frozenRunId,
        storedState,
        resolutionStatus,
        verifiedOutcomeId,
      },
      context,
    ) => {
      if (frozenRunId && latestPublished?.runId !== frozenRunId) {
        context.addIssue({
          code: "custom",
          message: "Frozen run must be the last published forecast",
          path: ["frozenRunId"],
        });
      }
      if (frozenRunId && storedState === "open") {
        context.addIssue({
          code: "custom",
          message: "A frozen question cannot be open",
          path: ["storedState"],
        });
      }
      if ((resolutionStatus === "verified") !== (verifiedOutcomeId !== null)) {
        context.addIssue({
          code: "custom",
          message: "Verified outcome and status must agree",
          path: ["verifiedOutcomeId"],
        });
      }
    },
  );

/** Run inputs are exact revision references, never mutable entity IDs. */
export const forecastRunSchema = z
  .object({
    runId: z.uuid(),
    questionId: z.uuid(),
    scope: editionScopeSchema,
    runSequence: z.number().int().positive(),
    kind: z.enum(["forecast", "retrospective_reconstruction"]),
    inputAsOf: utcInstantSchema,
    createdAt: utcInstantSchema,
    completedAt: utcInstantSchema.nullable(),
    inputRevisionIds: z.array(z.uuid()).min(1).readonly(),
    inputSnapshotHash: contentHashSchema,
    modelVersion: internalIdSchema,
    parameterVersion: internalIdSchema,
    modelStatus: z.enum(["experimental", "validated"]),
    seed: internalIdSchema,
    qualityStatus: z.enum(["complete", "incomplete"]),
  })
  .superRefine(
    ({ inputAsOf, createdAt, completedAt, inputRevisionIds }, context) => {
      if (Date.parse(inputAsOf) > Date.parse(createdAt))
        context.addIssue({
          code: "custom",
          message: "Input as-of follows creation",
          path: ["inputAsOf"],
        });
      if (completedAt && Date.parse(completedAt) < Date.parse(createdAt))
        context.addIssue({
          code: "custom",
          message: "Completion precedes creation",
          path: ["completedAt"],
        });
      if (new Set(inputRevisionIds).size !== inputRevisionIds.length) {
        context.addIssue({
          code: "custom",
          message: "Duplicate input revision",
          path: ["inputRevisionIds"],
        });
      }
    },
  );

export type ForecastQuestion = z.infer<typeof forecastQuestionSchema>;
export type ForecastRun = z.infer<typeof forecastRunSchema>;
export type ForecastCutoff = z.infer<typeof forecastCutoffSchema>;

export type ForecastReadState =
  | { kind: "current"; runId: string }
  | { kind: "not_published" }
  | { kind: "frozen"; runId: string; archived: boolean }
  | { kind: "closed_without_run"; archived: boolean };

/** Read-time cutoff prevents stale cache or a stopped worker from showing a current forecast. */
export function forecastReadState(
  question: ForecastQuestion,
  now: string,
): ForecastReadState {
  const archived = question.storedState === "archived";
  const nowMs = Date.parse(utcInstantSchema.parse(now));
  const closed =
    archived ||
    question.storedState === "closed" ||
    question.frozenRunId !== null ||
    nowMs >= Date.parse(question.cutoff.utcInstant);
  if (!closed) {
    return question.latestPublished
      ? { kind: "current", runId: question.latestPublished.runId }
      : { kind: "not_published" };
  }
  const runId = question.frozenRunId ?? question.latestPublished?.runId;
  return runId
    ? { kind: "frozen", runId, archived }
    : { kind: "closed_without_run", archived };
}

export type PublicationDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "closed"
        | "incomplete"
        | "wrong_question"
        | "wrong_edition"
        | "stale_run"
        | "wrong_kind"
        | "future_run";
    };

/** The repository must repeat this check with the database clock inside its publication transaction. */
export function assessForecastPublication(
  question: ForecastQuestion,
  run: ForecastRun,
  databaseNow: string,
): PublicationDecision {
  const databaseNowMs = Date.parse(utcInstantSchema.parse(databaseNow));
  if (
    question.storedState !== "open" ||
    question.frozenRunId !== null ||
    databaseNowMs >= Date.parse(question.cutoff.utcInstant)
  )
    return { allowed: false, reason: "closed" };
  if (run.kind !== "forecast") return { allowed: false, reason: "wrong_kind" };
  if (run.questionId !== question.questionId)
    return { allowed: false, reason: "wrong_question" };
  if (!sameEditionScope(run.scope, question.scope))
    return { allowed: false, reason: "wrong_edition" };
  if (run.runSequence <= (question.latestPublished?.runSequence ?? 0))
    return { allowed: false, reason: "stale_run" };
  if (
    question.latestPublished &&
    Date.parse(run.inputAsOf) < Date.parse(question.latestPublished.inputAsOf)
  )
    return { allowed: false, reason: "stale_run" };
  if (!run.completedAt || run.qualityStatus !== "complete")
    return { allowed: false, reason: "incomplete" };
  if (
    Date.parse(run.completedAt) > databaseNowMs ||
    Date.parse(run.inputAsOf) > databaseNowMs
  )
    return { allowed: false, reason: "future_run" };
  return { allowed: true };
}
