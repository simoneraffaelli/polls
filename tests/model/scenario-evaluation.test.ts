import { describe, expect, it } from "vitest";
import type { ModelSnapshot } from "@/elections/model/contracts";
import {
  assertCausalEvaluation,
  evaluateHeldOut,
  isComparableMarket,
  type EvaluationCase,
} from "@/elections/model/evaluate";
import { snapshotDigest } from "@/elections/model/snapshot-hash";
import { MIDTERMS_BASELINE_PARAMETERS } from "@/modules/usa/midterms/model/baseline";
import {
  runMidtermsScenario,
  type PublishedBaseRun,
} from "@/modules/usa/midterms/model/scenario";

const input: ModelSnapshot = {
  questionId: "question:test",
  scope: {
    sectionId: "section:us:midterms",
    editionId: "edition:us:midterms:2026",
  },
  kind: "forecast",
  inputAsOf: "2026-10-22T12:00:00Z",
  cutoffAt: "2026-11-03T00:00:00Z",
  catalogVersion: "catalog-v1",
  structuralReferenceId: "22222222-2222-4222-8222-222222222222",
  qualityPolicyVersion: "poll-quality-v1",
  modelVersion: "midterms-baseline-v1",
  parameterVersion: MIDTERMS_BASELINE_PARAMETERS.version,
  parameters: MIDTERMS_BASELINE_PARAMETERS,
  seed: "base-seed",
  races: [
    {
      raceId: "race:one",
      regionId: "east",
      priorMarginPoints: 1,
      priorSdPoints: 2,
      priorAvailableAt: "2026-10-01T00:00:00Z",
      priorVersion: "prior-v1",
      structuralStatus: "verified",
      mapVersion: "map-v1",
      resolutionRuleVersion: "binary-rule-v1",
      binaryResolutionVerified: true,
      positive: { partyId: "A", caucusId: "A" },
      negative: { partyId: "B", caucusId: "B" },
    },
  ],
  polls: [],
  control: {
    version: "one-seat-test-v1",
    outcomeKind: "seat_majority",
    resolutionRuleVerified: true,
    totalSeats: 1,
    majorityThreshold: 1,
    holdovers: [],
    holdoversAsOf: "2026-10-01T00:00:00Z",
    holdoversVerified: true,
    tieAt: null,
    tieBreakerCaucusId: null,
    tieRuleVerified: true,
  },
};

const evaluationCase = (
  year: number,
  split: EvaluationCase["split"],
): EvaluationCase => ({
  caseId: `case:${year}`,
  targetOutcomeId: "outcome:yes",
  cycleId: `cycle:${year}`,
  split,
  electionDate: `${year}-11-03`,
  forecastCutoffAt: `${year}-11-03T00:00:00Z`,
  inputAsOf: `${year}-10-01T12:00:00Z`,
  outcomeVerifiedAt: `${year}-12-01T00:00:00Z`,
  inputs: [
    {
      referenceId: `poll:${year}`,
      availableAt: `${year}-09-30T00:00:00Z`,
      acquiredAt: `${year}-09-30T00:00:00Z`,
      evidence: "actual_acquisition",
      archive: null,
    },
  ],
  probability: 0.7,
  baselineProbability: 0.5,
  outcome: 1,
  lower80: 1,
  upper80: 3,
  observedSeats: 2,
  predictedSeats: 2,
  market: {
    probability: 0.6,
    targetOutcomeId: "outcome:yes",
    contractId: "contract:sample",
    outcomeId: "market:yes",
    quoteId: `quote:${year}`,
    priceType: "bid_ask_midpoint",
    qualityStatus: "eligible",
    bid: 0.59,
    ask: 0.61,
    timestampFormatVerified: true,
    observedAt: `${year}-10-01T11:40:00Z`,
    acquiredAt: `${year}-10-01T11:45:00Z`,
    equivalence: {
      status: "verified",
      targetOutcomeId: "outcome:yes",
      marketContractId: "contract:sample",
      marketOutcomeId: "market:yes",
      referenceUrl: "https://example.org/rules/verified",
      checkedAt: `${year}-09-30T00:00:00Z`,
    },
  },
});

describe("published-run scenarios", () => {
  it("checks publication, scope and exact digest; keeps the base immutable and historical", async () => {
    const digest = await snapshotDigest(input);
    const base: PublishedBaseRun = {
      publicationId: "publication:1",
      runId: "run:1",
      questionId: input.questionId,
      scope: input.scope,
      inputSnapshotHash: digest,
      kind: "forecast",
      status: "published",
      readState: "frozen",
      modelStatus: "experimental",
    };
    const before = JSON.stringify(input);
    const scenario = await runMidtermsScenario({
      base,
      snapshot: input,
      swingPoints: 2,
      iterations: 100,
      seed: "scenario-1",
    });
    expect(scenario.kind).toBe("user_scenario");
    expect(scenario.historical).toBe(true);
    expect(scenario.modelStatus).toBe("experimental");
    expect(scenario.baseRunId).toBe("run:1");
    expect(JSON.stringify(input)).toBe(before);
    const unchanged = await runMidtermsScenario({
      base,
      snapshot: input,
      swingPoints: 0,
      iterations: 100,
      seed: "scenario-1",
    });
    expect(
      scenario.result.raceWinProbabilities[0].positiveProbability,
    ).toBeGreaterThan(
      unchanged.result.raceWinProbabilities[0].positiveProbability,
    );
    await expect(
      runMidtermsScenario({
        base: { ...base, inputSnapshotHash: "0".repeat(64) },
        snapshot: input,
        swingPoints: 0,
        iterations: 100,
        seed: "x",
      }),
    ).rejects.toThrow(/digest/);
    await expect(
      runMidtermsScenario({
        base,
        snapshot: {
          ...input,
          parameters: { ...input.parameters, nationalErrorSd: 7 },
        },
        swingPoints: 0,
        iterations: 100,
        seed: "x",
      }),
    ).rejects.toThrow(/digest/);
    await expect(
      runMidtermsScenario({
        base: { ...base, scope: { ...base.scope, editionId: "other" } },
        snapshot: input,
        swingPoints: 0,
        iterations: 100,
        seed: "x",
      }),
    ).rejects.toThrow(/matching/);
    await expect(
      runMidtermsScenario({
        base: { ...base, status: "published_reconstruction" },
        snapshot: input,
        swingPoints: 0,
        iterations: 100,
        seed: "x",
      }),
    ).rejects.toThrow(/published/);
    await expect(
      runMidtermsScenario({
        base,
        snapshot: input,
        swingPoints: Number.NaN,
        iterations: 100,
        seed: "x",
      }),
    ).rejects.toThrow(/bounds/);
    await expect(
      runMidtermsScenario({
        base,
        snapshot: input,
        swingPoints: 1,
        iterations: 2001,
        seed: "x",
      }),
    ).rejects.toThrow(/bounds/);
  });

  it("rejects nonplain, cyclic and nonfinite snapshots", async () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    await expect(snapshotDigest(cycle)).rejects.toThrow(/cycle/);
    await expect(snapshotDigest({ date: new Date() })).rejects.toThrow(/plain/);
    await expect(snapshotDigest({ value: Number.NaN })).rejects.toThrow(
      /non-finite/,
    );
  });
});

describe("causal held-out evaluation", () => {
  it("reports scores and resamples election cycles rather than claiming validation", () => {
    const cases = [
      evaluationCase(2014, "development"),
      evaluationCase(2016, "tuning"),
      evaluationCase(2018, "test"),
      evaluationCase(2020, "test"),
      evaluationCase(2022, "test"),
    ];
    const report = evaluateHeldOut(cases, "bootstrap-v1", 1000);
    expect(report.cases).toBe(3);
    expect(report.evidenceAudit).toBe("external_review_required");
    expect(report.cycles).toBe(3);
    expect(report.brier).toBeCloseTo(0.09);
    expect(report.baselineBrier).toBe(0.25);
    expect(report.brierDifferencePerCase).toBeCloseTo(-0.16);
    expect(report.brierDifferencePerCycle95?.[1]).toBeLessThan(0);
    expect(report.interval80Coverage).toBe(1);
    expect(report.seatMeanAbsoluteError).toBe(0);
    expect(report.marketComparableCases).toBe(3);
    expect(evaluateHeldOut(cases, "bootstrap-v1", 1000)).toEqual(report);
  });

  it("rejects late 2026 releases as 2024 inputs and split leakage", () => {
    const past = evaluationCase(2024, "test");
    const late = {
      ...past,
      inputs: [
        {
          ...past.inputs[0],
          availableAt: "2026-10-01T00:00:00Z",
          acquiredAt: "2026-10-01T00:00:00Z",
        },
      ],
    };
    expect(() => assertCausalEvaluation([late])).toThrow(/unavailable/);
    const assumed = {
      ...past,
      inputs: [{ ...past.inputs[0], evidence: "assumed_historical" as const }],
    };
    expect(() => assertCausalEvaluation([assumed])).toThrow(/Assumed/);
    const documented = {
      ...past,
      inputs: [
        {
          ...past.inputs[0],
          evidence: "documented_historical" as const,
          acquiredAt: "2026-10-01T00:00:00Z",
          archive: null,
        },
      ],
    };
    expect(() => assertCausalEvaluation([documented])).toThrow(
      /archive provenance/,
    );
    const reviewed = {
      ...documented,
      inputs: [
        {
          ...documented.inputs[0],
          archive: {
            url: "https://archive.example.org/polls/2024",
            version: "2024-09-30-v1",
            sha256: "a".repeat(64),
            availabilityReview: {
              status: "verified" as const,
              evidenceUrl: "https://archive.example.org/polls/2024/metadata",
              availableAt: past.inputs[0]!.availableAt,
              reviewedAt: "2026-10-01T00:00:00Z",
            },
          },
        },
      ],
    };
    expect(() => assertCausalEvaluation([reviewed])).not.toThrow();
    expect(() =>
      assertCausalEvaluation([
        {
          ...reviewed,
          inputs: [
            {
              ...reviewed.inputs[0],
              archive: { ...reviewed.inputs[0].archive, sha256: "unreviewed" },
            },
          ],
        },
      ]),
    ).toThrow(/archive provenance/);
    expect(() =>
      assertCausalEvaluation([
        {
          ...reviewed,
          inputs: [
            {
              ...reviewed.inputs[0],
              archive: {
                ...reviewed.inputs[0].archive,
                url: "http://archive.example.org/polls",
              },
            },
          ],
        },
      ]),
    ).toThrow(/archive provenance/);
    expect(() =>
      assertCausalEvaluation([{ ...past, inputAsOf: "2024-11-03T12:00:00Z" }]),
    ).toThrow(/cutoff/);
    expect(() =>
      assertCausalEvaluation([{ ...past, electionDate: "2024-02-31" }]),
    ).toThrow(/election date/);
    expect(() =>
      assertCausalEvaluation([{ ...past, outcome: 2 as 0 | 1 }]),
    ).toThrow(/binary/);
    expect(() => assertCausalEvaluation([{ ...past, inputs: [] }])).toThrow(
      /evidence/,
    );
    expect(() =>
      assertCausalEvaluation([
        {
          ...past,
          inputs: [
            { ...past.inputs[0], evidence: "unknown" as "actual_acquisition" },
          ],
        },
      ]),
    ).toThrow(/evidence/);
    expect(() =>
      assertCausalEvaluation([
        evaluationCase(2022, "tuning"),
        evaluationCase(2020, "test"),
      ]),
    ).toThrow(/chronological/);
    expect(() =>
      assertCausalEvaluation([
        { ...past, cycleId: "same", split: "test" },
        { ...evaluationCase(2022, "tuning"), cycleId: "same" },
      ]),
    ).toThrow(/more than one split/);
  });

  it("distinguishes per-case Brier from equal-weight per-cycle bootstrap when cycle sizes differ", () => {
    const sparse = [2020, 2022].map((year) => ({
      ...evaluationCase(year, "test"),
      outcome: 0 as const,
      probability: 1,
      baselineProbability: 0,
    }));
    const dense = Array.from({ length: 20 }, (_, index) => ({
      ...evaluationCase(2024, "test"),
      caseId: `dense:${index}`,
      outcome: 0 as const,
      probability: 0,
      baselineProbability: Math.sqrt(0.2),
    }));
    const report = evaluateHeldOut(
      [...sparse, ...dense],
      "unequal-cycles",
      1000,
    );
    expect(report.brierDifferencePerCase).toBeCloseTo(-2 / 22);
    expect(report.brierDifferencePerCycle).toBeCloseTo(0.6);
    expect(report.brierDifferencePerCycle95).not.toBeNull();
  });

  it("excludes mismatched, stale or unverified market quotes without inventing a comparison", () => {
    const base = evaluationCase(2024, "test");
    expect(isComparableMarket(base)).toBe(true);
    const opposite = {
      ...base,
      market: { ...base.market!, outcomeId: "market:no" },
    };
    const stale = {
      ...base,
      market: { ...base.market!, observedAt: "2024-10-01T11:00:00Z" },
    };
    const late = {
      ...base,
      market: { ...base.market!, acquiredAt: "2024-10-01T12:01:00Z" },
    };
    const unverified = {
      ...base,
      market: {
        ...base.market!,
        equivalence: {
          ...base.market!.equivalence,
          status: "unverified" as "verified",
        },
      },
    };
    const wide = {
      ...base,
      market: { ...base.market!, bid: 0.4, ask: 0.6 },
    };
    const missing = { ...base, market: null };
    for (const item of [opposite, stale, late, unverified, wide, missing]) {
      expect(isComparableMarket(item)).toBe(false);
      expect(
        evaluateHeldOut([item], "market-gate", 100).marketComparableCases,
      ).toBe(0);
    }
  });
});
