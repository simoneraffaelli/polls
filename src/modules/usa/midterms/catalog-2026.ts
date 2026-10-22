/** Verified structural catalogue only; no candidate, winner, map geometry or forecast is implied. */
export const MIDTERMS_2026_CATALOG_VERSION = "us-midterms-2026-structure-v1";
export const MIDTERMS_2026_EDITION_ID = "edition:us:midterms:2026";
export const MIDTERMS_2026_FORECAST_CUTOFF = "2026-11-03T00:00:00Z";
export const CENSUS_2020_APPORTIONMENT_URL =
  "https://www2.census.gov/programs-surveys/decennial/2020/data/apportionment/apportionment-2020-table01.pdf";
export const SENATE_CLASS_II_URL =
  "https://www.senate.gov/senators/Class_II.htm";
export const HOUSE_AT_LARGE_REFERENCE_URL =
  "https://www.census.gov/library/stories/2021/04/2020-census-data-release.html";

export const HOUSE_APPORTIONMENT_2020 = {
  AL: 7,
  AK: 1,
  AZ: 9,
  AR: 4,
  CA: 52,
  CO: 8,
  CT: 5,
  DE: 1,
  FL: 28,
  GA: 14,
  HI: 2,
  ID: 2,
  IL: 17,
  IN: 9,
  IA: 4,
  KS: 4,
  KY: 6,
  LA: 6,
  ME: 2,
  MD: 8,
  MA: 9,
  MI: 13,
  MN: 8,
  MS: 4,
  MO: 8,
  MT: 2,
  NE: 3,
  NV: 4,
  NH: 2,
  NJ: 12,
  NM: 3,
  NY: 26,
  NC: 14,
  ND: 1,
  OH: 15,
  OK: 5,
  OR: 6,
  PA: 17,
  RI: 2,
  SC: 7,
  SD: 1,
  TN: 9,
  TX: 38,
  UT: 4,
  VT: 1,
  VA: 11,
  WA: 10,
  WV: 2,
  WI: 8,
  WY: 1,
} as const;

export const SENATE_CLASS_II_2026_STATES = [
  "AL",
  "AK",
  "AR",
  "CO",
  "DE",
  "GA",
  "IA",
  "ID",
  "IL",
  "KS",
  "KY",
  "LA",
  "MA",
  "ME",
  "MI",
  "MN",
  "MS",
  "MT",
  "NC",
  "NE",
  "NH",
  "NJ",
  "NM",
  "OK",
  "OR",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "VA",
  "WV",
  "WY",
] as const;

export const SENATE_CLASS_III_SPECIAL_2026_STATES = ["FL", "OH"] as const;

type HouseRace = Readonly<{
  id: string;
  seatId: string;
  editionId: typeof MIDTERMS_2026_EDITION_ID;
  chamberId: "house";
  stateCode: string;
  districtCode: string;
  publicSlug: string;
  mapVersion: null;
  electionProcess:
    | Readonly<{
        kind: "louisiana_open_primary_possible_runoff";
        initialDate: "2026-11-03";
        possibleRunoffDate: "2026-12-12";
      }>
    | Readonly<{
        kind: "state_rules_pending";
        federalGeneralDate: "2026-11-03";
      }>;
  candidateStatus: "unverified";
  forecastCutoff: typeof MIDTERMS_2026_FORECAST_CUTOFF;
}>;

type SenateRace = Readonly<{
  id: string;
  seatId: string;
  editionId: typeof MIDTERMS_2026_EDITION_ID;
  chamberId: "senate";
  stateCode: string;
  senateClass: "II" | "III";
  electionType: "regular" | "special";
  publicSlug: string;
  candidateStatus: "unverified";
  forecastCutoff: typeof MIDTERMS_2026_FORECAST_CUTOFF;
}>;

export const HOUSE_2026_RACES: readonly HouseRace[] = Object.entries(
  HOUSE_APPORTIONMENT_2020,
).flatMap(([stateCode, count]) =>
  Array.from({ length: count }, (_, index) => {
    const districtCode =
      count === 1 ? "AL" : String(index + 1).padStart(2, "0");
    const key = `${stateCode.toLowerCase()}-${districtCode.toLowerCase()}`;
    return {
      id: `race:us:midterms:2026:house:${key}`,
      seatId: `seat:us:house:${key}`,
      editionId: MIDTERMS_2026_EDITION_ID,
      chamberId: "house",
      stateCode,
      districtCode,
      publicSlug: key,
      mapVersion: null,
      electionProcess:
        stateCode === "LA"
          ? {
              kind: "louisiana_open_primary_possible_runoff" as const,
              initialDate: "2026-11-03" as const,
              possibleRunoffDate: "2026-12-12" as const,
            }
          : {
              kind: "state_rules_pending" as const,
              federalGeneralDate: "2026-11-03" as const,
            },
      candidateStatus: "unverified",
      forecastCutoff: MIDTERMS_2026_FORECAST_CUTOFF,
    };
  }),
);

export const SENATE_2026_RACES: readonly SenateRace[] = [
  ...SENATE_CLASS_II_2026_STATES.map((stateCode) => ({
    stateCode,
    senateClass: "II" as const,
    electionType: "regular" as const,
  })),
  ...SENATE_CLASS_III_SPECIAL_2026_STATES.map((stateCode) => ({
    stateCode,
    senateClass: "III" as const,
    electionType: "special" as const,
  })),
].map(({ stateCode, senateClass, electionType }) => {
  const key = `${stateCode.toLowerCase()}-${senateClass.toLowerCase()}`;
  return {
    id: `race:us:midterms:2026:senate:${key}`,
    seatId: `seat:us:senate:${key}`,
    editionId: MIDTERMS_2026_EDITION_ID,
    chamberId: "senate",
    stateCode,
    senateClass,
    electionType,
    publicSlug: key,
    candidateStatus: "unverified",
    forecastCutoff: MIDTERMS_2026_FORECAST_CUTOFF,
  };
});

/** Aggregate historical snapshot, not a claim about each holdover seat on election day. */
export const SENATE_HOLDOVER_SNAPSHOT_2026_07_14 = {
  version: "senate-daily-press-2026-07-14",
  sourceUrl: "https://www.dailypress.senate.gov/on-the-floor/senate-facts/",
  asOfDate: "2026-07-14",
  notOnBallotSeats: 65,
  partyCounts: { republican: 31, democratic: 32, independent: 2 },
  caucusCounts: { republican: 31, democratic: 34 },
  individualSeatAssignmentsVerified: false,
  vacanciesVerifiedForRun: false,
} as const;
