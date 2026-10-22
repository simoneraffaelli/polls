import type {
  BaselineParameters,
  ModelDiagnostics,
  ModelSnapshot,
  PollModelInput,
  RaceEstimate,
} from "./contracts";
import {
  calendarDateSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";

const dayMs = 86_400_000;

function instant(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (
    !utcInstantSchema.safeParse(value).success ||
    !/(?:Z|\+00:00)$/.test(value) ||
    !Number.isFinite(parsed)
  ) {
    throw new Error(`${field} must be a UTC instant`);
  }
  return parsed;
}

function positive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${field} must be positive and finite`);
}

function pollWeight(
  poll: PollModelInput,
  asOfMs: number,
  parameters: BaselineParameters,
): number {
  if (poll.sampleSize === null || poll.quality === 0) return 0;
  const populationWeight = parameters.populationWeights[poll.population];
  if (populationWeight === 0) return 0;
  const observedDateMs = Date.parse(`${poll.observedEndDate}T00:00:00Z`);
  const ageDays = (asOfMs - observedDateMs) / dayMs;
  return (
    poll.quality *
    populationWeight *
    Math.sqrt(Math.min(poll.sampleSize, parameters.sampleCap) / 1000) *
    2 ** (-ageDays / parameters.halfLifeDays)
  );
}

export function aggregateRaces(snapshot: ModelSnapshot): {
  estimates: readonly RaceEstimate[];
  diagnostics: ModelDiagnostics;
} {
  const parameters = snapshot.parameters;
  if (!parameters?.populationWeights)
    throw new Error("Missing baseline parameters");
  const validId = (value: string) =>
    typeof value === "string" && value.length > 0 && value.length <= 200;
  if (
    !validId(snapshot.questionId) ||
    !validId(snapshot.scope.sectionId) ||
    !validId(snapshot.scope.editionId) ||
    !validId(snapshot.catalogVersion) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      snapshot.structuralReferenceId,
    ) ||
    snapshot.qualityPolicyVersion !== "poll-quality-v1" ||
    !validId(snapshot.modelVersion) ||
    !validId(snapshot.parameterVersion) ||
    !validId(snapshot.seed) ||
    !["forecast", "retrospective_reconstruction"].includes(snapshot.kind) ||
    snapshot.parameterVersion !== parameters.version
  ) {
    throw new Error("Model identity or parameter version is incomplete");
  }
  const asOfMs = instant(snapshot.inputAsOf, "inputAsOf");
  const cutoffMs = instant(snapshot.cutoffAt, "cutoffAt");
  if (snapshot.kind === "forecast" && asOfMs >= cutoffMs) {
    throw new Error("Forecast inputAsOf is at or after cutoff");
  }
  for (const [field, value] of Object.entries({
    halfLifeDays: parameters.halfLifeDays,
    sampleCap: parameters.sampleCap,
    pollSdAtWeightOne: parameters.pollSdAtWeightOne,
    missingPollSdMultiplier: parameters.missingPollSdMultiplier,
  }))
    positive(value, field);
  if (
    parameters.halfLifeDays < 1 ||
    parameters.halfLifeDays > 365 ||
    parameters.sampleCap < 1 ||
    parameters.sampleCap > 100_000 ||
    parameters.pollSdAtWeightOne < 0.1 ||
    parameters.pollSdAtWeightOne > 100 ||
    parameters.missingPollSdMultiplier < 1 ||
    parameters.missingPollSdMultiplier > 10
  )
    throw new Error("Baseline parameters outside supported bounds");
  const populations = [
    "likely_voters",
    "registered_voters",
    "adults",
    "other",
  ] as const;
  if (
    populations.some(
      (kind) => !Number.isFinite(parameters.populationWeights[kind]),
    )
  ) {
    throw new Error("Population weights are incomplete");
  }
  for (const [field, value] of Object.entries({
    nationalErrorSd: parameters.nationalErrorSd,
    regionalErrorSd: parameters.regionalErrorSd,
    localErrorSd: parameters.localErrorSd,
    ...parameters.populationWeights,
  })) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > (field.endsWith("ErrorSd") ? 50 : 1)
    )
      throw new Error(`${field} must be nonnegative and finite`);
  }
  if (
    snapshot.races.length < 1 ||
    snapshot.races.length > 500 ||
    snapshot.polls.length > 10_000
  )
    throw new Error("Race count outside model bounds");
  const raceIds = new Set<string>();
  const issues = new Set<string>();
  const warnings = new Set<string>();
  let assumedInputs = 0;
  let positiveAxis: string | null = null;
  let negativeAxis: string | null = null;
  for (const race of snapshot.races) {
    if (
      !validId(race.raceId) ||
      !validId(race.regionId) ||
      !validId(race.priorVersion) ||
      !validId(race.resolutionRuleVersion) ||
      !["verified", "assumed"].includes(race.structuralStatus) ||
      raceIds.has(race.raceId)
    ) {
      throw new Error("Missing or duplicate race identity");
    }
    raceIds.add(race.raceId);
    if (
      !Number.isFinite(race.priorMarginPoints) ||
      Math.abs(race.priorMarginPoints) > 100
    ) {
      throw new Error("Prior margin must be percentage points in [-100, 100]");
    }
    positive(race.priorSdPoints, "priorSdPoints");
    if (race.priorSdPoints < 0.01 || race.priorSdPoints > 100)
      throw new Error("priorSdPoints outside bounds");
    if (instant(race.priorAvailableAt, "priorAvailableAt") > asOfMs) {
      throw new Error("Structural prior was not available as of the run");
    }
    if (
      !validId(race.positive.partyId) ||
      !validId(race.negative.partyId) ||
      race.positive.partyId === race.negative.partyId
    ) {
      throw new Error("Race outcomes must identify two different parties");
    }
    if (race.structuralStatus === "assumed") {
      assumedInputs += 1;
      issues.add("assumed_structural_input");
    }
    if (race.mapVersion === null) issues.add("unverified_race_map");
    if (!race.binaryResolutionVerified)
      issues.add("unverified_race_resolution");
    if (
      snapshot.control?.outcomeKind === "chamber_control" &&
      (!race.positive.caucusId || !race.negative.caucusId)
    )
      issues.add("unknown_caucus_mapping");
    const positiveSide =
      snapshot.control?.outcomeKind === "chamber_control"
        ? race.positive.caucusId
        : race.positive.partyId;
    const negativeSide =
      snapshot.control?.outcomeKind === "chamber_control"
        ? race.negative.caucusId
        : race.negative.partyId;
    if (positiveSide && negativeSide) {
      if (positiveSide === negativeSide)
        throw new Error("Binary outcomes have the same shared-error side");
      if (
        positiveAxis !== null &&
        (positiveAxis !== positiveSide || negativeAxis !== negativeSide)
      ) {
        throw new Error(
          "Mixed race orientation cannot share one national shock",
        );
      }
      positiveAxis = positiveSide;
      negativeAxis = negativeSide;
    }
  }
  const signalIds = new Set<string>();
  for (const poll of snapshot.polls) {
    if (
      !validId(poll.signalId) ||
      !validId(poll.revisionId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        poll.pollLinkId,
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        poll.optionMappingId,
      ) ||
      !validId(poll.externalQuestionId) ||
      !validId(poll.positiveOptionId) ||
      !validId(poll.negativeOptionId) ||
      poll.positiveOptionId === poll.negativeOptionId ||
      !validId(poll.pollsterId) ||
      !validId(poll.sampleGroupId) ||
      signalIds.has(poll.signalId)
    ) {
      throw new Error("Missing or duplicate poll signal identity");
    }
    signalIds.add(poll.signalId);
    if (!raceIds.has(poll.raceId))
      throw new Error("Poll targets an unregistered race");
    if (
      !Number.isFinite(poll.marginPoints) ||
      Math.abs(poll.marginPoints) > 100
    ) {
      throw new Error("Poll margin must be percentage points in [-100, 100]");
    }
    if (
      !Number.isFinite(poll.quality) ||
      poll.quality < 0 ||
      poll.quality > 1
    ) {
      throw new Error("Poll quality must be in [0, 1]");
    }
    if (
      poll.sampleSize !== null &&
      (!Number.isInteger(poll.sampleSize) ||
        poll.sampleSize <= 0 ||
        poll.sampleSize > 10_000_000)
    ) {
      throw new Error("Poll sample size must be positive or null");
    }
    if (instant(poll.availableAt, "poll.availableAt") > asOfMs) {
      throw new Error("Poll was not available as of the run");
    }
    const acquiredMs = instant(poll.acquiredAt, "poll.acquiredAt");
    if (
      !calendarDateSchema.safeParse(poll.observedEndDate).success ||
      poll.observedEndDate > snapshot.inputAsOf.slice(0, 10)
    )
      throw new Error("Poll observed end date is invalid or after inputAsOf");
    if (
      !["likely_voters", "registered_voters", "adults", "other"].includes(
        poll.population,
      ) ||
      ![
        "actual_acquisition",
        "documented_historical",
        "assumed_historical",
      ].includes(poll.availability)
    )
      throw new Error("Unknown poll population or availability kind");
    if (poll.availability === "actual_acquisition") {
      if (acquiredMs > asOfMs || poll.availableAt !== poll.acquiredAt) {
        throw new Error(
          "Actual acquisition follows inputAsOf or availability differs",
        );
      }
    } else {
      if (snapshot.kind === "forecast")
        throw new Error("Forecast cannot use reconstructed availability");
      if (poll.availability === "assumed_historical") {
        assumedInputs += 1;
        issues.add("assumed_historical_availability");
      }
    }
    if (poll.sampleSize === null) warnings.add("unknown_poll_sample_size");
  }

  const estimates = snapshot.races.map((race) => {
    const groups = new Map<
      string,
      { weightedMargin: number; weight: number; cap: number }
    >();
    for (const poll of snapshot.polls) {
      if (poll.raceId !== race.raceId) continue;
      const weight = pollWeight(poll, asOfMs, parameters);
      if (weight === 0) continue;
      const key = `${poll.pollsterId}\u0000${poll.sampleGroupId}`;
      const group = groups.get(key) ?? { weightedMargin: 0, weight: 0, cap: 0 };
      group.weightedMargin += poll.marginPoints * weight;
      group.weight += weight;
      group.cap = Math.max(group.cap, weight);
      groups.set(key, group);
    }
    let weightedMargin = 0;
    let effectiveWeight = 0;
    for (const group of groups.values()) {
      weightedMargin += (group.weightedMargin / group.weight) * group.cap;
      effectiveWeight += group.cap;
    }
    const hasLocalPolls = effectiveWeight > 0;
    if (!hasLocalPolls) warnings.add("missing_local_polls");
    const priorVariance =
      race.priorSdPoints ** 2 *
      (hasLocalPolls ? 1 : parameters.missingPollSdMultiplier ** 2);
    const priorPrecision = 1 / priorVariance;
    const pollPrecision = hasLocalPolls
      ? effectiveWeight / parameters.pollSdAtWeightOne ** 2
      : 0;
    const posteriorVariance = 1 / (priorPrecision + pollPrecision);
    const pollMean = hasLocalPolls ? weightedMargin / effectiveWeight : 0;
    const meanMarginPoints =
      posteriorVariance *
      (race.priorMarginPoints * priorPrecision + pollMean * pollPrecision);
    if (
      ![meanMarginPoints, posteriorVariance, effectiveWeight].every(
        Number.isFinite,
      )
    )
      throw new Error("Model estimate is non-finite");
    return {
      raceId: race.raceId,
      regionId: race.regionId,
      meanMarginPoints,
      posteriorSdPoints: Math.sqrt(posteriorVariance),
      effectivePollWeight: effectiveWeight,
      pollGroups: groups.size,
      hasLocalPolls,
      positive: race.positive,
      negative: race.negative,
    } satisfies RaceEstimate;
  });

  let expectedContestedSeats: number | null = null;
  if (snapshot.control) {
    const control = snapshot.control;
    if (
      !validId(control.version) ||
      !["seat_majority", "chamber_control"].includes(control.outcomeKind) ||
      !Number.isInteger(control.totalSeats) ||
      control.totalSeats < 1 ||
      control.totalSeats > 500 ||
      !Number.isInteger(control.majorityThreshold) ||
      control.majorityThreshold <= control.totalSeats / 2 ||
      control.majorityThreshold > control.totalSeats
    ) {
      throw new Error("Invalid control rule");
    }
    if (instant(control.holdoversAsOf, "holdoversAsOf") > asOfMs)
      throw new Error("Holdover snapshot follows inputAsOf");
    let holdoverCount = 0;
    for (const holdover of control.holdovers) {
      if (
        !validId(holdover.partyId) ||
        !Number.isInteger(holdover.count) ||
        holdover.count < 0
      )
        throw new Error("Invalid holdover");
      holdoverCount += holdover.count;
      if (control.outcomeKind === "chamber_control" && !holdover.caucusId)
        issues.add("unknown_holdover_caucus");
    }
    expectedContestedSeats = control.totalSeats - holdoverCount;
    if (expectedContestedSeats < 0)
      throw new Error("Holdovers exceed total seats");
    if (expectedContestedSeats !== snapshot.races.length)
      issues.add("incomplete_race_roster");
    if (!control.holdoversVerified) issues.add("unverified_holdovers");
    if (!control.resolutionRuleVerified) issues.add("unverified_question_rule");
    if (control.tieAt !== null) {
      if (
        control.outcomeKind !== "chamber_control" ||
        !Number.isInteger(control.tieAt) ||
        control.tieAt !== control.totalSeats / 2 ||
        control.majorityThreshold !== control.tieAt + 1
      )
        throw new Error("Tie rule contradicts chamber arithmetic");
      const caucuses = new Set([
        ...snapshot.races.flatMap((race) => [
          race.positive.caucusId,
          race.negative.caucusId,
        ]),
        ...control.holdovers.map((holdover) => holdover.caucusId),
      ]);
      if (
        !control.tieRuleVerified ||
        !control.tieBreakerCaucusId ||
        !caucuses.has(control.tieBreakerCaucusId)
      )
        issues.add("unverified_tie_rule");
    } else if (control.tieBreakerCaucusId !== null) {
      throw new Error("Tie breaker without a tie rule");
    }
  } else {
    issues.add("control_rule_missing");
  }
  return {
    estimates,
    diagnostics: {
      quality: issues.size === 0 ? "complete" : "incomplete",
      issues: [...issues].sort(),
      warnings: [...warnings].sort(),
      modeledRaces: estimates.length,
      expectedContestedSeats,
      racesWithLocalPolls: estimates.filter((race) => race.hasLocalPolls)
        .length,
      assumedInputs,
    },
  };
}
