import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseMedslSenateCsv,
  senateResultAvailableAt,
} from "../../src/integrations/medsl/senate";
import { prepareSenateResults } from "../../src/integrations/medsl/prepared-import";

const fixture = readFileSync(
  fileURLToPath(
    new URL(
      "../fixtures/providers/medsl-senate-v8-sample.csv",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("MEDSL Senate V8 original CSV parser", () => {
  const results = parseMedslSenateCsv(fixture);

  it("prepares stable hashes and refuses duplicate contest identities", () => {
    const first = prepareSenateResults(results);
    const second = prepareSenateResults(results);
    expect(first.map((row) => row.contentHash)).toEqual(
      second.map((row) => row.contentHash),
    );
    expect(() => prepareSenateResults([...results, results[0]!])).toThrow(
      "Duplicate",
    );
  });

  it("keeps general, runoff and special contests separate", () => {
    expect(results).toHaveLength(5);
    expect(results.map((result) => result.contestKey)).toContain(
      "medsl:senate:2022:GA:runoff:regular",
    );
    expect(results.map((result) => result.contestKey)).toContain(
      "medsl:senate:2021:GA:runoff:regular",
    );
    expect(results.map((result) => result.contestKey)).toContain(
      "medsl:senate:2024:OH:general:regular",
    );
  });

  it("matches the Clerk's Ohio 2024 Senate totals without multiplying totalvotes", () => {
    const ohio = results.find(
      (result) => result.year === 2024 && result.stateCode === "OH",
    );
    expect(ohio).toMatchObject({
      totalVotes: 5_704_620,
      unattributedVotes: 640,
      margin: {
        status: "eligible",
        leadingCandidate: "BERNIE MORENO",
        votes: 206_434,
      },
      provenance: {
        version: "V8",
        releaseDate: "2026-05-11",
        exPostOutcome: true,
      },
    });
    expect(
      ohio?.candidates.find((candidate) => candidate.name === "BERNIE MORENO")
        ?.votes,
    ).toBe(2_857_383);
    expect(
      ohio?.candidates.find((candidate) => candidate.name === "SHERROD BROWN")
        ?.votes,
    ).toBe(2_650_949);
  });

  it("aggregates fusion ballot lines per candidate and counts totalvotes once", () => {
    const ny = results.find(
      (result) => result.year === 1976 && result.stateCode === "NY",
    );
    expect(
      ny?.candidates.find(
        (candidate) => candidate.name === "DANIEL PATRICK MOYNIHAN",
      ),
    ).toMatchObject({
      votes: 3_422_594,
    });
    expect(
      ny?.candidates.find(
        (candidate) => candidate.name === "DANIEL PATRICK MOYNIHAN",
      )?.ballotLines,
    ).toHaveLength(2);
    expect(ny?.totalVotes).toBe(6_666_875);
  });

  it("excludes unofficial and one-vote placeholders from margins", () => {
    expect(
      results.find(
        (result) => result.year === 2021 && result.stateCode === "GA",
      )?.margin,
    ).toEqual({
      status: "excluded",
      reason: "unofficial",
    });
    expect(
      results.find(
        (result) => result.year === 1978 && result.stateCode === "LA",
      )?.margin,
    ).toEqual({
      status: "excluded",
      reason: "placeholder_one_vote",
    });
  });

  it("does not retrodate the 2026 release as an available 2024 predictor", () => {
    const ohio = results.find(
      (result) => result.year === 2024 && result.stateCode === "OH",
    );
    expect(ohio).toBeDefined();
    if (!ohio) return;
    expect(senateResultAvailableAt(ohio, "2024-11-04T00:00:00Z")).toBe(false);
    expect(senateResultAvailableAt(ohio, "2026-05-12T00:00:00Z")).toBe(true);
  });

  it("rejects changed headers and inconsistent contest totals", () => {
    expect(() =>
      parseMedslSenateCsv(fixture.replace("candidatevotes", "votes")),
    ).toThrow("Unexpected MEDSL Senate V8 header");
    const changed = fixture.replace("5704620.0", "5704621.0");
    expect(() => parseMedslSenateCsv(changed)).toThrow(
      "Inconsistent MEDSL contest total votes",
    );
  });
});
