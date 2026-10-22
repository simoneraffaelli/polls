import type {
  ControlDefinition,
  BaselineParameters,
  ModelDiagnostics,
  ModelResult,
  ModelSnapshot,
  RaceEstimate,
  SeatSummary,
} from "./contracts";
import { aggregateRaces } from "./aggregate";
import { seededNormal } from "./random";

function summarize(id: string, values: readonly number[]): SeatSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    id,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    lower80: sorted[Math.floor((sorted.length - 1) * 0.1)],
    upper80: sorted[Math.ceil((sorted.length - 1) * 0.9)],
  };
}

function controlOutcome(
  counts: ReadonlyMap<string, number>,
  unknownSeats: number,
  rule: ControlDefinition,
): string {
  const prefix =
    rule.outcomeKind === "chamber_control" ? "control" : "majority";
  const majority = [...counts].find(
    ([, count]) => count >= rule.majorityThreshold,
  );
  if (majority) return `${prefix}:${majority[0]}`;
  if (unknownSeats > 0) return "unresolved";
  if (rule.tieAt !== null && rule.tieRuleVerified && rule.tieBreakerCaucusId) {
    const entries = [...counts];
    if (
      entries.length === 2 &&
      entries.every(([, count]) => count === rule.tieAt)
    ) {
      return `${prefix}:${rule.tieBreakerCaucusId}`;
    }
  }
  return "no_majority";
}

function initialSeatCounts(
  partySeats: ReadonlyMap<string, readonly number[]>,
  caucusSeats: ReadonlyMap<string, readonly number[]>,
  control: ControlDefinition | null,
) {
  const partyCounts = new Map([...partySeats.keys()].map((id) => [id, 0]));
  const caucusCounts = new Map([...caucusSeats.keys()].map((id) => [id, 0]));
  let unknownSeats = 0;
  for (const holdover of control?.holdovers ?? []) {
    partyCounts.set(
      holdover.partyId,
      (partyCounts.get(holdover.partyId) ?? 0) + holdover.count,
    );
    if (holdover.caucusId) {
      caucusCounts.set(
        holdover.caucusId,
        (caucusCounts.get(holdover.caucusId) ?? 0) + holdover.count,
      );
    } else unknownSeats += holdover.count;
  }
  return { partyCounts, caucusCounts, unknownSeats };
}

function sampleRaces(input: {
  races: readonly RaceEstimate[];
  parameters: BaselineParameters;
  swingPoints: number;
  nationalShock: number;
  regionalShocks: ReadonlyMap<string, number>;
  normal: () => number;
  wins: Map<string, number>;
  partyCounts: Map<string, number>;
  caucusCounts: Map<string, number>;
}): number {
  let unknownSeats = 0;
  for (const race of input.races) {
    const localSd = Math.hypot(
      race.posteriorSdPoints,
      input.parameters.localErrorSd,
    );
    const margin =
      race.meanMarginPoints +
      input.swingPoints +
      input.nationalShock +
      input.regionalShocks.get(race.regionId)! +
      input.normal() * localSd;
    const positiveWins = margin >= 0;
    if (positiveWins)
      input.wins.set(race.raceId, input.wins.get(race.raceId)! + 1);
    const outcome = positiveWins ? race.positive : race.negative;
    input.partyCounts.set(
      outcome.partyId,
      (input.partyCounts.get(outcome.partyId) ?? 0) + 1,
    );
    if (outcome.caucusId) {
      input.caucusCounts.set(
        outcome.caucusId,
        (input.caucusCounts.get(outcome.caucusId) ?? 0) + 1,
      );
    } else unknownSeats += 1;
  }
  return unknownSeats;
}

function assertSimulationBudget(
  swingPoints: number,
  iterations: number,
  raceCount: number,
): void {
  if (!Number.isFinite(swingPoints) || Math.abs(swingPoints) > 5) {
    throw new Error("Uniform swing exceeds model bounds");
  }
  if (
    !Number.isInteger(iterations) ||
    iterations < 100 ||
    iterations > 20_000 ||
    iterations * raceCount > 5_000_000
  ) {
    throw new Error("Simulation exceeds iteration or race-work budget");
  }
}

function seatIds(
  races: readonly RaceEstimate[],
  control: ControlDefinition | null,
) {
  const partyIds = new Set<string>();
  const caucusIds = new Set<string>();
  for (const race of races) {
    partyIds.add(race.positive.partyId);
    partyIds.add(race.negative.partyId);
    if (race.positive.caucusId) caucusIds.add(race.positive.caucusId);
    if (race.negative.caucusId) caucusIds.add(race.negative.caucusId);
  }
  for (const holdover of control?.holdovers ?? []) {
    partyIds.add(holdover.partyId);
    if (holdover.caucusId) caucusIds.add(holdover.caucusId);
  }
  return { partyIds, caucusIds };
}

/** Pure, bounded Monte Carlo. It never labels itself validated or publishes a forecast. */
export function simulateBaseline(
  snapshot: ModelSnapshot,
  iterations: number,
  options: Readonly<{ uniformSwingPoints?: number }> = {},
): ModelResult {
  const { estimates, diagnostics } = aggregateRaces(snapshot);
  return simulateEstimates({
    modelVersion: snapshot.modelVersion,
    parameters: snapshot.parameters,
    seed: snapshot.seed,
    estimates,
    diagnostics,
    control: snapshot.control,
    iterations,
    ...options,
  });
}

/** Shared simulation kernel for a sealed run and its public aggregate basis. */
export function simulateEstimates(
  input: Readonly<{
    modelVersion: string;
    parameters: BaselineParameters;
    seed: string;
    estimates: readonly RaceEstimate[];
    diagnostics: ModelDiagnostics;
    control: ControlDefinition | null;
    iterations: number;
    uniformSwingPoints?: number;
  }>,
): ModelResult {
  const {
    modelVersion,
    parameters,
    seed,
    estimates,
    diagnostics,
    control,
    iterations,
  } = input;
  const swingPoints = input.uniformSwingPoints ?? 0;
  assertSimulationBudget(swingPoints, iterations, estimates.length);
  const sortedRaces = [...estimates].sort((a, b) =>
    a.raceId.localeCompare(b.raceId),
  );
  const regionIds = [
    ...new Set(sortedRaces.map((race) => race.regionId)),
  ].sort();
  const { partyIds, caucusIds } = seatIds(sortedRaces, control);
  const partySeats = new Map(
    [...partyIds].sort().map((id) => [id, [] as number[]]),
  );
  const caucusSeats = new Map(
    [...caucusIds].sort().map((id) => [id, [] as number[]]),
  );
  const wins = new Map(sortedRaces.map((race) => [race.raceId, 0]));
  const controls = new Map<string, number>();
  const normal = seededNormal(`${modelVersion}:${parameters.version}:${seed}`);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nationalShock = normal() * parameters.nationalErrorSd;
    const regionalShocks = new Map(
      regionIds.map((id) => [id, normal() * parameters.regionalErrorSd]),
    );
    const {
      partyCounts,
      caucusCounts,
      unknownSeats: holdoverUnknown,
    } = initialSeatCounts(partySeats, caucusSeats, control);
    const unknownSeats =
      holdoverUnknown +
      sampleRaces({
        races: sortedRaces,
        parameters,
        swingPoints,
        nationalShock,
        regionalShocks,
        normal,
        wins,
        partyCounts,
        caucusCounts,
      });
    for (const [id, values] of partySeats)
      values.push(partyCounts.get(id) ?? 0);
    for (const [id, values] of caucusSeats)
      values.push(caucusCounts.get(id) ?? 0);
    if (control && diagnostics.quality === "complete") {
      const outcome = controlOutcome(
        control.outcomeKind === "seat_majority" ? partyCounts : caucusCounts,
        control.outcomeKind === "seat_majority" ? 0 : unknownSeats,
        control,
      );
      controls.set(outcome, (controls.get(outcome) ?? 0) + 1);
    }
  }
  return {
    modelStatus: "experimental",
    parametersVersion: parameters.version,
    seed,
    iterations,
    diagnostics,
    races: sortedRaces,
    raceWinProbabilities: sortedRaces.map((race) => ({
      raceId: race.raceId,
      positiveProbability: wins.get(race.raceId)! / iterations,
    })),
    partySeats: [...partySeats].map(([id, values]) => summarize(id, values)),
    caucusSeats: [...caucusSeats].map(([id, values]) => summarize(id, values)),
    questionOutcomeKind: control?.outcomeKind ?? null,
    questionOutcomeProbabilities: [...controls]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([outcomeId, count]) => ({
        outcomeId,
        probability: count / iterations,
      })),
  };
}
