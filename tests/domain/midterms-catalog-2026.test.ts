import { describe, expect, it } from "vitest";
import {
  HOUSE_2026_RACES,
  HOUSE_APPORTIONMENT_2020,
  MIDTERMS_2026_EDITION_ID,
  MIDTERMS_2026_FORECAST_CUTOFF,
  SENATE_2026_RACES,
  SENATE_CLASS_II_2026_STATES,
  SENATE_HOLDOVER_SNAPSHOT_2026_07_14,
} from "../../src/modules/usa/midterms/catalog-2026";

describe("2026 Midterms structural catalogue", () => {
  it("has exactly the 435 Census-apportioned voting House districts", () => {
    expect(Object.keys(HOUSE_APPORTIONMENT_2020)).toHaveLength(50);
    expect(HOUSE_2026_RACES).toHaveLength(435);
    expect(new Set(HOUSE_2026_RACES.map((race) => race.id)).size).toBe(435);
    for (const [state, count] of Object.entries(HOUSE_APPORTIONMENT_2020)) {
      const districts = HOUSE_2026_RACES.filter(
        (race) => race.stateCode === state,
      ).map((race) => race.districtCode);
      expect(districts).toEqual(
        Array.from({ length: count }, (_, index) =>
          count === 1 ? "AL" : String(index + 1).padStart(2, "0"),
        ),
      );
    }
  });

  it("retains Louisiana's documented House runoff possibility without assuming it occurred", () => {
    const louisiana = HOUSE_2026_RACES.filter(
      (race) => race.stateCode === "LA",
    );
    expect(louisiana).toHaveLength(6);
    expect(
      louisiana.every(
        (race) =>
          race.electionProcess.kind ===
            "louisiana_open_primary_possible_runoff" &&
          race.electionProcess.initialDate === "2026-11-03" &&
          race.electionProcess.possibleRunoffDate === "2026-12-12",
      ),
    ).toBe(true);
  });

  it("has 33 regular Class II and two distinct Class III special Senate races", () => {
    expect(SENATE_CLASS_II_2026_STATES).toHaveLength(33);
    expect(SENATE_2026_RACES).toHaveLength(35);
    expect(
      SENATE_2026_RACES.filter((race) => race.electionType === "special").map(
        (race) => race.stateCode,
      ),
    ).toEqual(["FL", "OH"]);
    expect(new Set(SENATE_2026_RACES.map((race) => race.id)).size).toBe(35);
    expect(SENATE_HOLDOVER_SNAPSHOT_2026_07_14.notOnBallotSeats).toBe(65);
    expect(
      Object.values(SENATE_HOLDOVER_SNAPSHOT_2026_07_14.partyCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(65);
  });

  it("keeps seat IDs, race IDs and slugs unique within the US edition without invented candidates", () => {
    const allRaces = [...HOUSE_2026_RACES, ...SENATE_2026_RACES];
    expect(new Set(allRaces.map((race) => race.id)).size).toBe(470);
    expect(new Set(allRaces.map((race) => race.seatId)).size).toBe(470);
    for (const race of allRaces) {
      expect(race.editionId).toBe(MIDTERMS_2026_EDITION_ID);
      expect(race.id).toMatch(/^race:us:midterms:2026:/);
      expect(race.seatId).toMatch(/^seat:us:/);
      expect(race.candidateStatus).toBe("unverified");
      expect(race.forecastCutoff).toBe(MIDTERMS_2026_FORECAST_CUTOFF);
    }
  });
});
