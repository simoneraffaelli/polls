import { describe, expect, it } from "vitest";
import {
  assessForecastPublication,
  forecastCutoffSchema,
  forecastQuestionSchema,
  forecastReadState,
  forecastRunSchema,
} from "../../src/platform/publication/forecast";

const ids = {
  question: "11111111-1111-4111-8111-111111111111",
  run: "22222222-2222-4222-8222-222222222222",
  revision: "33333333-3333-4333-8333-333333333333",
};

const cutoff = {
  version: 1,
  localDateTime: "2026-11-02T19:00:00",
  timeZone: "America/New_York",
  utcInstant: "2026-11-03T00:00:00Z",
  calendarReference: "https://www.fec.gov/calendar",
};

const question = forecastQuestionSchema.parse({
  questionId: ids.question,
  scope: {
    sectionId: "section:us:midterms",
    editionId: "edition:us:midterms:2026",
  },
  outcomeDefinition: "Controllo della Camera",
  resolutionRuleVersion: "house-control-1",
  cutoff,
  storedState: "open",
  latestPublished: null,
  frozenRunId: null,
  resolutionStatus: "pending",
  verifiedOutcomeId: null,
});

const run = forecastRunSchema.parse({
  runId: ids.run,
  questionId: ids.question,
  scope: question.scope,
  runSequence: 1,
  kind: "forecast",
  inputAsOf: "2026-11-02T18:00:00Z",
  createdAt: "2026-11-02T18:01:00Z",
  completedAt: "2026-11-02T18:02:00Z",
  inputRevisionIds: [ids.revision],
  inputSnapshotHash: "b".repeat(64),
  modelVersion: "baseline-1",
  parameterVersion: "parameters-1",
  modelStatus: "experimental",
  seed: "fixed-seed",
  qualityStatus: "complete",
});

const published = {
  runId: ids.run,
  runSequence: 1,
  inputAsOf: run.inputAsOf,
  publishedAt: "2026-11-02T18:05:00Z",
  cutoffVersion: 1,
  cutoffAtPublication: cutoff.utcInstant,
};

describe("forecast publication and historical reads", () => {
  it("validates the original calendar zone against the UTC cutoff", () => {
    expect(forecastCutoffSchema.safeParse(cutoff).success).toBe(true);
    expect(
      forecastCutoffSchema.safeParse({
        ...cutoff,
        localDateTime: "2026-11-02T20:00:00",
      }).success,
    ).toBe(false);
    expect(
      forecastCutoffSchema.safeParse({ ...cutoff, timeZone: "Invalid/Zone" })
        .success,
    ).toBe(false);
    expect(
      forecastCutoffSchema.safeParse({
        ...cutoff,
        localDateTime: "2026-11-02T19:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects cross-edition, duplicate-input and stale runs", () => {
    expect(
      assessForecastPublication(question, run, "2026-11-02T18:10:00Z"),
    ).toEqual({ allowed: true });
    expect(
      assessForecastPublication(
        question,
        {
          ...run,
          scope: { ...run.scope, editionId: "edition:us:midterms:2028" },
        },
        "2026-11-02T18:10:00Z",
      ),
    ).toEqual({ allowed: false, reason: "wrong_edition" });
    expect(
      assessForecastPublication(
        { ...question, latestPublished: published },
        run,
        "2026-11-02T18:10:00Z",
      ),
    ).toEqual({ allowed: false, reason: "stale_run" });
    expect(
      assessForecastPublication(
        { ...question, latestPublished: published },
        { ...run, runSequence: 2, inputAsOf: "2026-11-02T17:59:00Z" },
        "2026-11-02T18:10:00Z",
      ),
    ).toEqual({ allowed: false, reason: "stale_run" });
    expect(
      forecastRunSchema.safeParse({
        ...run,
        inputRevisionIds: [ids.revision, ids.revision],
      }).success,
    ).toBe(false);
    expect(
      forecastRunSchema.safeParse({
        ...run,
        inputAsOf: "2026-11-02T18:01:00.500Z",
      }).success,
    ).toBe(false);
  });

  it("blocks the exact deadline and never reopens a persisted closed question", () => {
    expect(
      assessForecastPublication(question, run, "2026-11-03T00:00:00Z"),
    ).toEqual({ allowed: false, reason: "closed" });
    expect(
      forecastReadState(
        { ...question, latestPublished: published },
        "2026-11-02T18:30:00Z",
      ),
    ).toEqual({ kind: "current", runId: ids.run });
    expect(
      forecastReadState(
        { ...question, latestPublished: published },
        "2026-11-03T00:00:00Z",
      ),
    ).toEqual({ kind: "frozen", runId: ids.run, archived: false });
    const laterCutoff = {
      ...cutoff,
      version: 2,
      utcInstant: "2026-11-04T00:00:00Z",
      localDateTime: "2026-11-03T19:00:00",
    };
    expect(
      assessForecastPublication(
        { ...question, storedState: "closed", cutoff: laterCutoff },
        run,
        "2026-11-03T00:01:00Z",
      ),
    ).toEqual({ allowed: false, reason: "closed" });
    expect(
      forecastReadState(
        {
          ...question,
          storedState: "closed",
          cutoff: laterCutoff,
          latestPublished: published,
        },
        "2026-11-03T00:01:00Z",
      ),
    ).toEqual({ kind: "frozen", runId: ids.run, archived: false });
  });

  it("distinguishes an archive without a published run from a reconstruction", () => {
    expect(forecastReadState(question, "2026-11-03T00:00:00Z")).toEqual({
      kind: "closed_without_run",
      archived: false,
    });
    expect(
      forecastReadState(
        { ...question, storedState: "archived" },
        "2026-11-02T18:00:00Z",
      ),
    ).toEqual({ kind: "closed_without_run", archived: true });
    expect(
      assessForecastPublication(
        question,
        { ...run, kind: "retrospective_reconstruction" },
        "2026-11-02T18:10:00Z",
      ),
    ).toEqual({ allowed: false, reason: "wrong_kind" });
    expect(
      forecastQuestionSchema.safeParse({
        ...question,
        latestPublished: published,
        frozenRunId: ids.revision,
      }).success,
    ).toBe(false);
    expect(
      forecastQuestionSchema.safeParse({
        ...question,
        latestPublished: published,
        frozenRunId: ids.run,
      }).success,
    ).toBe(false);
  });
});
