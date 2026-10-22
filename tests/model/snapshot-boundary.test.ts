import { describe, expect, it } from "vitest";
import {
  modelSnapshotSchema,
  parseModelSnapshot,
} from "../../src/elections/model/snapshot-schema";
import { MIDTERMS_BASELINE_PARAMETERS } from "../../src/modules/usa/midterms/model/baseline";

const snapshot = {
  questionId: "q",
  scope: { sectionId: "s", editionId: "e" },
  kind: "forecast",
  inputAsOf: "2026-10-22T00:00:00Z",
  cutoffAt: "2026-11-03T00:00:00Z",
  catalogVersion: "v1",
  structuralReferenceId: "22222222-2222-4222-8222-222222222222",
  qualityPolicyVersion: "poll-quality-v1",
  modelVersion: "v1",
  parameterVersion: MIDTERMS_BASELINE_PARAMETERS.version,
  parameters: MIDTERMS_BASELINE_PARAMETERS,
  seed: "1",
  polls: [],
  control: null,
  races: [
    {
      raceId: "r",
      regionId: "region",
      priorMarginPoints: 0,
      priorSdPoints: 5,
      priorAvailableAt: "2026-01-01T00:00:00Z",
      priorVersion: "v1",
      structuralStatus: "assumed",
      mapVersion: null,
      resolutionRuleVersion: "v1",
      binaryResolutionVerified: false,
      positive: { partyId: "a", caucusId: "a" },
      negative: { partyId: "b", caucusId: "b" },
    },
  ],
};

describe("snapshot JSON boundary", () => {
  it("rejects truthy strings and unknown fields without coercing them into verification", () => {
    expect(parseModelSnapshot(snapshot).races[0].binaryResolutionVerified).toBe(
      false,
    );
    expect(
      modelSnapshotSchema.safeParse({
        ...snapshot,
        races: [{ ...snapshot.races[0], binaryResolutionVerified: "false" }],
      }).success,
    ).toBe(false);
    expect(
      modelSnapshotSchema.safeParse({
        ...snapshot,
        validationStatus: "validated",
      }).success,
    ).toBe(false);
  });
  it("checks cross-field chronology after structural parsing", () => {
    expect(() =>
      parseModelSnapshot({
        ...snapshot,
        races: [
          { ...snapshot.races[0], priorAvailableAt: "2027-01-01T00:00:00Z" },
        ],
      }),
    ).toThrow(/not available/);
  });
});
