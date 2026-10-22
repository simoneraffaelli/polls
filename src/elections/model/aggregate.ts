import type {
  BaselineParameters,
  ModelDiagnostics,
  ModelSnapshot,
  PollModelInput,
  RaceEstimate,
} from "./contracts";
import {
  validateSnapshotHeader,
  validateRaces,
  validatePolls,
  validateControl,
} from "./aggregate-validation";

const dayMs = 86_400_000;

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

function estimateRaces(
  snapshot: ModelSnapshot,
  asOfMs: number,
  warnings: Set<string>,
): readonly RaceEstimate[] {
  const parameters = snapshot.parameters;
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

  return estimates;
}

export function aggregateRaces(snapshot: ModelSnapshot): {
  estimates: readonly RaceEstimate[];
  diagnostics: ModelDiagnostics;
} {
  const asOfMs = validateSnapshotHeader(snapshot);
  const issues = new Set<string>();
  const warnings = new Set<string>();
  const { raceIds, assumedInputs: assumedRaces } = validateRaces(
    snapshot,
    asOfMs,
    issues,
  );
  const assumedPolls = validatePolls(
    snapshot,
    asOfMs,
    raceIds,
    issues,
    warnings,
  );
  const estimates = estimateRaces(snapshot, asOfMs, warnings);
  const expectedContestedSeats = validateControl(snapshot, asOfMs, issues);
  const assumedInputs = assumedRaces + assumedPolls;
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
