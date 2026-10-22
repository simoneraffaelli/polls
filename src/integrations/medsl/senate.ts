import { CollectionError } from "../../platform/collection/errors";
import { parseCsv } from "../../platform/collection/csv";

export const MEDSL_SENATE_V8 = {
  doi: "10.7910/DVN/PEJ5QU",
  version: "V8",
  releaseDate: "2026-05-11",
  // Release time is unknown: only the following UTC day is treated as available.
  availableAt: "2026-05-12T00:00:00Z",
  acquiredDate: "2026-10-22",
  originalFileSha256:
    "6f745db1b4a0026ad837e74428f9ed6f3f77fa51eb6f858b58ebdbc186fdb3bd",
  license: "CC0-1.0",
} as const;

export const MEDSL_SENATE_HEADER = [
  "year",
  "state",
  "state_po",
  "state_fips",
  "state_cen",
  "state_ic",
  "office",
  "district",
  "stage",
  "special",
  "candidate",
  "party_detailed",
  "writein",
  "mode",
  "candidatevotes",
  "totalvotes",
  "unofficial",
  "version",
  "party_simplified",
] as const;

export type SenateResult = {
  contestKey: string;
  year: number;
  stateCode: string;
  stage: "general" | "runoff" | "pre";
  sourceStageCodes: string[];
  special: boolean;
  totalVotes: number;
  unattributedVotes: number;
  candidates: {
    name: string;
    votes: number;
    ballotLines: {
      partyDetailed: string | null;
      partySimplified: string | null;
      votes: number;
    }[];
  }[];
  margin:
    | {
        status: "eligible";
        leadingCandidate: string;
        votes: number;
        share: number;
      }
    | { status: "excluded"; reason: string };
  sourceVersions: string[];
  provenance: typeof MEDSL_SENATE_V8 & { exPostOutcome: true };
};

function integer(value: string): number {
  if (!/^\d+(?:\.0+)?$/.test(value))
    throw new CollectionError("schema", "Invalid MEDSL vote count");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new CollectionError(
      "schema",
      "MEDSL vote count exceeds safe integer",
    );
  return parsed;
}

function boolean(value: string): boolean {
  if (value === "True") return true;
  if (value === "False") return false;
  throw new CollectionError("schema", "Invalid MEDSL boolean");
}

function stage(value: string): SenateResult["stage"] {
  const normalized = value.trim().toUpperCase();
  if (normalized === "GEN") return "general";
  if (normalized === "RUNOFF" || normalized === "GEN RUNOFF") return "runoff";
  if (normalized === "PRE") return "pre";
  throw new CollectionError("schema", "Unknown MEDSL Senate stage");
}

type Row = {
  year: number;
  stateCode: string;
  sourceStage: string;
  stage: SenateResult["stage"];
  special: boolean;
  candidate: string;
  partyDetailed: string | null;
  partySimplified: string | null;
  writeIn: boolean;
  candidateVotes: number;
  totalVotes: number;
  unofficial: boolean;
  sourceVersion: string;
};

function parseRow(values: string[]): Row {
  if (values.length !== MEDSL_SENATE_HEADER.length)
    throw new CollectionError(
      "schema",
      "MEDSL Senate row has wrong column count",
    );
  const [
    year,
    ,
    stateCode,
    ,
    ,
    ,
    office,
    district,
    sourceStage,
    special,
    candidate,
    partyDetailed,
    writeIn,
    mode,
    candidateVotes,
    totalVotes,
    unofficial,
    sourceVersion,
    partySimplified,
  ] = values;
  if (
    !/^\d{4}$/.test(year) ||
    !/^[A-Z]{2}$/.test(stateCode) ||
    office !== "US SENATE" ||
    district !== "statewide" ||
    mode.toUpperCase() !== "TOTAL" ||
    !sourceVersion.trim()
  )
    throw new CollectionError("schema", "Invalid MEDSL Senate row identity");
  return {
    year: Number(year),
    stateCode,
    sourceStage,
    stage: stage(sourceStage),
    special: boolean(special),
    candidate: candidate.trim().replace(/\s+/g, " "),
    partyDetailed: partyDetailed.trim() || null,
    partySimplified: partySimplified.trim() || null,
    writeIn: boolean(writeIn),
    candidateVotes: integer(candidateVotes),
    totalVotes: integer(totalVotes),
    unofficial: boolean(unofficial),
    sourceVersion,
  };
}

function buildContest(rows: Row[]): SenateResult {
  const first = rows[0];
  if (!first) throw new CollectionError("schema", "Empty MEDSL Senate contest");
  if (rows.some((row) => row.totalVotes !== first.totalVotes))
    throw new CollectionError(
      "schema",
      "Inconsistent MEDSL contest total votes",
    );
  if (
    rows.reduce((sum, row) => sum + row.candidateVotes, 0) !== first.totalVotes
  )
    throw new CollectionError(
      "schema",
      "MEDSL candidate votes do not sum to contest total",
    );

  const candidates = new Map<string, SenateResult["candidates"][number]>();
  let unattributedVotes = 0;
  for (const row of rows) {
    if (
      !row.candidate ||
      row.candidate === "OTHER" ||
      row.candidate === "WRITE-IN"
    ) {
      unattributedVotes += row.candidateVotes;
      continue;
    }
    const candidate = candidates.get(row.candidate) ?? {
      name: row.candidate,
      votes: 0,
      ballotLines: [],
    };
    candidate.votes += row.candidateVotes;
    candidate.ballotLines.push({
      partyDetailed: row.partyDetailed,
      partySimplified: row.partySimplified,
      votes: row.candidateVotes,
    });
    candidates.set(row.candidate, candidate);
  }
  const ranked = [...candidates.values()].sort(
    (a, b) => b.votes - a.votes || a.name.localeCompare(b.name),
  );
  let margin: SenateResult["margin"];
  if (rows.some((row) => row.unofficial)) {
    margin = { status: "excluded", reason: "unofficial" };
  } else if (
    rows.some((row) => row.candidateVotes === 1) ||
    first.totalVotes <= 1
  ) {
    margin = { status: "excluded", reason: "placeholder_one_vote" };
  } else if (first.stage === "pre") {
    margin = { status: "excluded", reason: "pre_stage_not_final" };
  } else if (
    ranked.length < 2 ||
    ranked[0]!.votes === ranked[1]!.votes ||
    unattributedVotes >= ranked[1]!.votes ||
    unattributedVotes >= ranked[0]!.votes - ranked[1]!.votes
  ) {
    margin = { status: "excluded", reason: "unresolved_ranking" };
  } else {
    const votes = ranked[0]!.votes - ranked[1]!.votes;
    margin = {
      status: "eligible",
      leadingCandidate: ranked[0]!.name,
      votes,
      share: votes / first.totalVotes,
    };
  }
  return {
    contestKey: `medsl:senate:${first.year}:${first.stateCode}:${first.stage}:${first.special ? "special" : "regular"}`,
    year: first.year,
    stateCode: first.stateCode,
    stage: first.stage,
    sourceStageCodes: [...new Set(rows.map((row) => row.sourceStage))].sort(),
    special: first.special,
    totalVotes: first.totalVotes,
    unattributedVotes,
    candidates: ranked,
    margin,
    sourceVersions: [...new Set(rows.map((row) => row.sourceVersion))].sort(),
    provenance: { ...MEDSL_SENATE_V8, exPostOutcome: true },
  };
}

/** Fixed-header, versioned import of ex-post outcomes. No result becomes a historical predictor. */
export function parseMedslSenateCsv(text: string): SenateResult[] {
  if (text.length > 2_000_000)
    throw new CollectionError(
      "budget",
      "MEDSL Senate CSV exceeds import limit",
    );
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  if (firstLine !== MEDSL_SENATE_HEADER.join(","))
    throw new CollectionError("schema", "Unexpected MEDSL Senate V8 header");
  const rows = parseCsv(text, {
    maxRows: 5_000,
    maxColumns: MEDSL_SENATE_HEADER.length,
    maxCellChars: 1_000,
  });
  const groups = new Map<string, Row[]>();
  for (const record of rows) {
    const values = MEDSL_SENATE_HEADER.map((column) => record[column] ?? "");
    const row = parseRow(values);
    const key = `${row.year}:${row.stateCode}:${row.stage}:${row.special}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(buildContest)
    .sort((a, b) => a.contestKey.localeCompare(b.contestKey));
}

export function senateResultAvailableAt(
  result: SenateResult,
  asOf: string,
): boolean {
  const instant = Date.parse(asOf);
  return (
    Number.isFinite(instant) &&
    instant >= Date.parse(result.provenance.availableAt)
  );
}
