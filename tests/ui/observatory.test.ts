import { describe, expect, it } from "vitest";
import { comparablePollSeries } from "@/platform/presentation/observatory";
import type { ObservatoryPoll } from "@/platform/observatory/read-contracts";
import { parsePublicAsOf, parsePublicOffset } from "@/composition/observatory";

const poll = (
  id: string,
  populationKind: string,
  wording: string,
  percentage: number,
): ObservatoryPoll => ({
  pollId: id,
  linkId: `link:${id}`,
  revisionId: `revision:${id}`,
  revisionNo: 1,
  raceId: null,
  pollster: "Istituto",
  sponsors: [],
  fieldworkStart: "2026-10-01",
  fieldworkEnd: id === "a" ? "2026-10-02" : "2026-10-03",
  declaredPublication: null,
  acquiredAt: "2026-10-04T00:00:00Z",
  sourceUrl: "https://example.org/poll",
  currentLinkIncluded: true,
  linkDecisionReason: null,
  excludedFromFutureForecasts: false,
  pollExclusionReason: null,
  source: {
    id: "source",
    name: "Fonte",
    attribution: null,
    termsUrl: null,
    excludedFromForecasts: false,
    forecastExclusionReason: null,
    state: {
      status: "current",
      acquiredAt: "2026-10-04T00:00:00Z",
      lastErrorCode: null,
    },
  },
  questions: [
    {
      id: `question:${id}`,
      wording,
      kind: "generic_ballot",
      populationKind,
      populationDescription: populationKind,
      sampleGroupId: `sample:${id}`,
      sampleSize: 1000,
      options: [{ id: `option:${id}`, label: "Opzione A", percentage }],
    },
  ],
});

describe("public observatory presentation", () => {
  it("keeps historical reads bounded and rejects malformed snapshot parameters", () => {
    expect(parsePublicAsOf("2026-02-31T00:00:00Z")).toBeNull();
    expect(parsePublicAsOf("2027-01-01T00:00:00Z")).toBeNull();
    expect(parsePublicOffset("10001")).toBeNull();
    expect(parsePublicOffset("-1")).toBeNull();
    expect(parsePublicOffset("25")).toBe(25);
  });

  it("builds a descriptive series only from the same question, population, race and outcome", () => {
    expect(
      comparablePollSeries([
        poll("a", "likely_voters", "Domanda A", 51),
        poll("b", "registered_voters", "Domanda A", 49),
      ]),
    ).toEqual([]);
    expect(
      comparablePollSeries([
        poll("a", "likely_voters", "Domanda A", 51),
        poll("b", "likely_voters", "Domanda B", 49),
      ]),
    ).toEqual([]);
    const series = comparablePollSeries([
      poll("b", "likely_voters", "Domanda A", 49),
      poll("a", "likely_voters", "Domanda A", 51),
    ]);
    expect(series.map((point) => point.value)).toEqual([51, 49]);
    expect(
      comparablePollSeries([
        poll("a", "likely_voters", "Domanda A", 51),
        {
          ...poll("b", "likely_voters", "Domanda A", 49),
          currentLinkIncluded: false,
          linkDecisionReason: "association_superseded",
        },
      ]),
    ).toEqual([]);
  });
});
