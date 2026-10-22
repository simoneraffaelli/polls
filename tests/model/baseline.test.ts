import { describe, expect, it } from "vitest";
import { aggregateRaces } from "@/elections/model/aggregate";
import type {
  ModelSnapshot,
  PollModelInput,
  RaceModelInput,
} from "@/elections/model/contracts";
import { simulateBaseline } from "@/elections/model/simulate";
import { assessModelQuality } from "@/elections/model/quality";
import {
  MIDTERMS_BASELINE_PARAMETERS,
  houseSeatMajorityRule,
  senateCaucusMajorityRule,
} from "@/modules/usa/midterms/model/baseline";

const asOf = "2026-10-22T12:00:00Z";
const race = (id: string, margin = 0, regionId = "east"): RaceModelInput => ({
  raceId: id,
  regionId,
  priorMarginPoints: margin,
  priorSdPoints: 0.01,
  priorAvailableAt: "2026-10-01T00:00:00Z",
  priorVersion: "structural-v1",
  structuralStatus: "verified",
  mapVersion: "map-v1",
  resolutionRuleVersion: "binary-rule-v1",
  binaryResolutionVerified: true,
  positive: { partyId: "A", caucusId: "A" },
  negative: { partyId: "B", caucusId: "B" },
});
const poll = (id: string, margin: number): PollModelInput => ({
  signalId: id,
  revisionId: `revision:${id}`,
  raceId: "race:one",
  pollsterId: "firm:one",
  sampleGroupId: "sample:shared",
  population: "likely_voters",
  sampleSize: 1000,
  quality: 1,
  observedEndDate: "2026-10-20",
  acquiredAt: "2026-10-21T12:00:00Z",
  availableAt: "2026-10-21T12:00:00Z",
  availability: "actual_acquisition",
  marginPoints: margin,
});
const snapshot = (
  races: readonly RaceModelInput[],
  polls: readonly PollModelInput[] = [],
): ModelSnapshot => ({
  questionId: "question:test",
  scope: {
    sectionId: "section:us:midterms",
    editionId: "edition:us:midterms:2026",
  },
  kind: "forecast",
  inputAsOf: asOf,
  cutoffAt: "2026-11-03T00:00:00Z",
  catalogVersion: "catalog-v1",
  modelVersion: "midterms-baseline-v1",
  parameterVersion: MIDTERMS_BASELINE_PARAMETERS.version,
  parameters: MIDTERMS_BASELINE_PARAMETERS,
  seed: "golden-1",
  races,
  polls,
  control: {
    version: "two-seat-test-v1",
    outcomeKind: "seat_majority",
    resolutionRuleVerified: true,
    totalSeats: races.length,
    majorityThreshold: races.length,
    holdovers: [],
    holdoversAsOf: "2026-10-01T00:00:00Z",
    holdoversVerified: true,
    tieAt: null,
    tieBreakerCaucusId: null,
    tieRuleVerified: true,
  },
});

describe("Midterms experimental baseline", () => {
  it("caps overlapping sample cuts at one group's weight", () => {
    const single = aggregateRaces(
      snapshot([race("race:one")], [poll("rv", 10)]),
    ).estimates[0];
    const shared = aggregateRaces(
      snapshot([race("race:one")], [poll("rv", 10), poll("lv", -10)]),
    ).estimates[0];
    expect(shared.pollGroups).toBe(1);
    expect(shared.effectivePollWeight).toBeCloseTo(
      single.effectivePollWeight,
      12,
    );
    expect(shared.meanMarginPoints).toBeCloseTo(0, 12);
  });

  it("rejects future inputs, reconstructed availability in a forecast, and cutoff runs", () => {
    const base = snapshot([race("race:one")]);
    expect(() => aggregateRaces({ ...base, inputAsOf: base.cutoffAt })).toThrow(
      /cutoff/,
    );
    expect(() =>
      aggregateRaces({
        ...base,
        races: [{ ...base.races[0], priorAvailableAt: "2026-10-23T00:00:00Z" }],
      }),
    ).toThrow(/not available/);
    expect(() =>
      aggregateRaces({
        ...base,
        polls: [
          {
            ...poll("one", 2),
            acquiredAt: "2026-10-23T00:00:00Z",
            availableAt: "2026-10-23T00:00:00Z",
          },
        ],
      }),
    ).toThrow(/not available/);
    expect(() =>
      aggregateRaces({
        ...base,
        polls: [{ ...poll("one", 2), availability: "documented_historical" }],
      }),
    ).toThrow(/reconstructed/);
    expect(() =>
      aggregateRaces({ ...base, polls: [{ ...poll("one", 101) }] }),
    ).toThrow(/percentage points/);
    const reconstruction = {
      ...base,
      kind: "retrospective_reconstruction" as const,
      polls: [
        {
          ...poll("one", 2),
          availability: "documented_historical" as const,
          acquiredAt: "2026-11-01T00:00:00Z",
        },
      ],
    };
    expect(aggregateRaces(reconstruction).estimates[0].hasLocalPolls).toBe(
      true,
    );
  });

  it("shares national shocks and reproduces identical results for the same seed", () => {
    const input = snapshot([race("race:one"), race("race:two")]);
    const correlated = simulateBaseline(
      {
        ...input,
        parameters: {
          ...MIDTERMS_BASELINE_PARAMETERS,
          nationalErrorSd: 5,
          regionalErrorSd: 0,
          localErrorSd: 0,
        },
      },
      10000,
    );
    const repeat = simulateBaseline(
      {
        ...input,
        parameters: {
          ...MIDTERMS_BASELINE_PARAMETERS,
          nationalErrorSd: 5,
          regionalErrorSd: 0,
          localErrorSd: 0,
        },
      },
      10000,
    );
    const independent = simulateBaseline(
      {
        ...input,
        parameters: {
          ...MIDTERMS_BASELINE_PARAMETERS,
          nationalErrorSd: 0,
          regionalErrorSd: 0,
          localErrorSd: 0,
        },
      },
      10000,
    );
    expect(repeat).toEqual(correlated);
    const control = (result: typeof correlated) =>
      result.questionOutcomeProbabilities.find(
        (entry) => entry.outcomeId === "majority:A",
      )!.probability;
    expect(control(correlated)).toBeGreaterThan(0.45);
    expect(control(independent)).toBeLessThan(0.3);
    expect(correlated.modelStatus).toBe("experimental");
  });

  it("keeps incomplete rosters diagnostic and does not invent control odds", () => {
    const input = {
      ...snapshot([race("race:one")]),
      control: houseSeatMajorityRule(),
    };
    const result = simulateBaseline(input, 100);
    expect(result.diagnostics.issues).toContain("incomplete_race_roster");
    expect(result.questionOutcomeProbabilities).toEqual([]);
    expect(assessModelQuality(input, result).status).toBe("blocked");
    expect(result.diagnostics.warnings).toContain("missing_local_polls");
  });

  it("requires verified Senate holdovers and an explicit tie breaker", () => {
    const races = [race("race:one", 100), race("race:two", -100)];
    const holdovers = [
      { partyId: "A", caucusId: "A", count: 49 },
      { partyId: "B", caucusId: "B", count: 49 },
    ];
    const control = senateCaucusMajorityRule({
      holdovers,
      asOf: "2026-10-01T00:00:00Z",
      verified: true,
      tieBreakerCaucusId: "A",
      tieRuleVerified: true,
      version: "senate-test-v1",
    });
    const input = { ...snapshot(races), control };
    const result = simulateBaseline(
      {
        ...input,
        parameters: {
          ...MIDTERMS_BASELINE_PARAMETERS,
          nationalErrorSd: 0,
          regionalErrorSd: 0,
          localErrorSd: 0,
        },
      },
      100,
    );
    expect(result.questionOutcomeProbabilities).toEqual([
      { outcomeId: "majority:A", probability: 1 },
    ]);
    expect(assessModelQuality(input, result).status).toBe(
      "experimental_candidate",
    );
    const unknown = simulateBaseline(
      { ...input, control: { ...control, tieRuleVerified: false } },
      100,
    );
    expect(unknown.diagnostics.issues).toContain("unverified_tie_rule");
    expect(unknown.questionOutcomeProbabilities).toEqual([]);
  });

  it("rejects excessive computation and nonfinite parameters", () => {
    const input = snapshot([race("race:one")]);
    expect(() => simulateBaseline(input, 20001)).toThrow(/budget/);
    expect(() =>
      simulateBaseline(
        {
          ...input,
          parameters: {
            ...MIDTERMS_BASELINE_PARAMETERS,
            nationalErrorSd: Number.NaN,
          },
        },
        100,
      ),
    ).toThrow(/finite/);
  });

  it("rejects invalid or future calendar dates, mixed binary orientation and incoherent control rules", () => {
    const input = snapshot([race("race:one"), race("race:two")]);
    const onePoll = poll("one", 2);
    expect(() =>
      aggregateRaces({
        ...input,
        polls: [{ ...onePoll, observedEndDate: "2026-02-31" }],
      }),
    ).toThrow(/observed end date/);
    expect(() =>
      aggregateRaces({
        ...input,
        polls: [{ ...onePoll, observedEndDate: "2026-10-23" }],
      }),
    ).toThrow(/observed end date/);
    expect(() =>
      aggregateRaces({
        ...input,
        races: [
          input.races[0],
          {
            ...input.races[1],
            positive: race("x").negative,
            negative: race("x").positive,
          },
        ],
      }),
    ).toThrow(/Mixed race orientation/);
    expect(() =>
      aggregateRaces({
        ...input,
        control: { ...input.control!, majorityThreshold: 1 },
      }),
    ).toThrow(/Invalid control rule/);
    expect(() =>
      aggregateRaces({
        ...input,
        control: {
          ...input.control!,
          outcomeKind: "chamber_control",
          tieAt: 2,
          tieBreakerCaucusId: "A",
        },
      }),
    ).toThrow(/Tie rule contradicts/);
    expect(() =>
      aggregateRaces({
        ...input,
        parameters: { ...input.parameters, halfLifeDays: 1e-300 },
      }),
    ).toThrow(/bounds/);
  });
});
