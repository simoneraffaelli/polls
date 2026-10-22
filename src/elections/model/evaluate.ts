import { seededUniform } from "./random";
import {
  calendarDateSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";

export type HistoricalAvailability = Readonly<{
  referenceId: string;
  availableAt: string;
  acquiredAt: string;
  evidence:
    "actual_acquisition" | "documented_historical" | "assumed_historical";
  archive: Readonly<{
    url: string;
    version: string;
    sha256: string;
    availabilityReview: Readonly<{
      status: "verified";
      evidenceUrl: string;
      availableAt: string;
      reviewedAt: string;
    }>;
  }> | null;
}>;

export type MarketEvaluationEvidence = Readonly<{
  probability: number;
  targetOutcomeId: string;
  contractId: string;
  outcomeId: string;
  quoteId: string;
  priceType: "bid_ask_midpoint";
  qualityStatus: "eligible";
  bid: number;
  ask: number;
  timestampFormatVerified: boolean;
  observedAt: string;
  acquiredAt: string;
  equivalence: Readonly<{
    status: "verified";
    targetOutcomeId: string;
    marketContractId: string;
    marketOutcomeId: string;
    referenceUrl: string;
    checkedAt: string;
  }>;
}>;

export type EvaluationCase = Readonly<{
  caseId: string;
  targetOutcomeId: string;
  cycleId: string;
  split: "development" | "tuning" | "test";
  electionDate: string;
  forecastCutoffAt: string;
  inputAsOf: string;
  outcomeVerifiedAt: string;
  inputs: readonly HistoricalAvailability[];
  probability: number;
  baselineProbability: number;
  outcome: 0 | 1;
  lower80: number | null;
  upper80: number | null;
  observedSeats: number | null;
  predictedSeats: number | null;
  market: MarketEvaluationEvidence | null;
}>;

export type CalibrationBin = Readonly<{
  lower: number;
  upper: number;
  count: number;
  meanPredicted: number | null;
  observedRate: number | null;
}>;

export type EvaluationReport = Readonly<{
  /** The pure scorer does not authenticate archives or assign model validation. */
  evidenceAudit: "external_review_required";
  cases: number;
  cycles: number;
  brier: number;
  baselineBrier: number;
  /** Per-case difference; comparable to brier - baselineBrier. */
  brierDifferencePerCase: number;
  /** Equal weight per election cycle, regardless of the number of cases. */
  brierDifferencePerCycle: number;
  brierDifferencePerCycle95: readonly [number, number] | null;
  logLoss: number;
  baselineLogLoss: number;
  expectedCalibrationError: number;
  calibration: readonly CalibrationBin[];
  interval80Coverage: number | null;
  seatMeanAbsoluteError: number | null;
  marketBrierEquivalentOnly: number | null;
  marketComparableCases: number;
}>;

const epsilon = 1e-6;
const brier = (probability: number, outcome: 0 | 1) =>
  (probability - outcome) ** 2;
const logLoss = (probability: number, outcome: 0 | 1) => {
  const clipped = Math.min(1 - epsilon, Math.max(epsilon, probability));
  return -(outcome * Math.log(clipped) + (1 - outcome) * Math.log(1 - clipped));
};
const average = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const validId = (value: unknown) =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0 &&
  value.length <= 200;

function httpsReference(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function safeTimestamp(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !utcInstantSchema.safeParse(value).success ||
    !/(?:Z|\+00:00)$/.test(value)
  )
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A market comparison is admitted only for the exact target and a timely, eligible quote. */
export function isComparableMarket(item: EvaluationCase): boolean {
  const market = item.market;
  if (!market) return false;
  const asOf = safeTimestamp(item.inputAsOf);
  const observed = safeTimestamp(market.observedAt);
  const acquired = safeTimestamp(market.acquiredAt);
  const checked = safeTimestamp(market.equivalence?.checkedAt);
  return !!(
    asOf !== null &&
    observed !== null &&
    acquired !== null &&
    checked !== null &&
    validId(item.targetOutcomeId) &&
    validId(market.contractId) &&
    validId(market.outcomeId) &&
    validId(market.quoteId) &&
    market.targetOutcomeId === item.targetOutcomeId &&
    market.equivalence.status === "verified" &&
    market.equivalence.targetOutcomeId === item.targetOutcomeId &&
    market.equivalence.marketContractId === market.contractId &&
    market.equivalence.marketOutcomeId === market.outcomeId &&
    httpsReference(market.equivalence.referenceUrl) &&
    checked <= asOf &&
    market.priceType === "bid_ask_midpoint" &&
    market.timestampFormatVerified === true &&
    Number.isFinite(market.bid) &&
    Number.isFinite(market.ask) &&
    market.bid >= 0 &&
    market.bid <= market.ask &&
    market.ask <= 1 &&
    market.ask - market.bid <= 0.05 + 1e-9 &&
    Math.abs(market.probability - (market.bid + market.ask) / 2) <= 1e-9 &&
    market.qualityStatus === "eligible" &&
    Number.isFinite(market.probability) &&
    market.probability >= 0 &&
    market.probability <= 1 &&
    observed <= acquired &&
    acquired <= asOf &&
    asOf - observed <= 30 * 60_000
  );
}

function timestamp(value: string, field: string): number {
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

/** Checks declared chronology and provenance shape, not the truth of external evidence. */
export function assertCausalEvaluation(cases: readonly EvaluationCase[]): void {
  if (cases.length === 0) throw new Error("Evaluation needs cases");
  const splits = new Map<string, EvaluationCase["split"]>();
  const caseIds = new Set<string>();
  const datesBySplit = new Map<EvaluationCase["split"], number[]>();
  for (const item of cases) {
    if (
      !validId(item.caseId) ||
      !validId(item.cycleId) ||
      !validId(item.targetOutcomeId) ||
      caseIds.has(item.caseId)
    )
      throw new Error("Missing or duplicate evaluation case");
    if (!["development", "tuning", "test"].includes(item.split))
      throw new Error("Unknown evaluation split");
    if (item.outcome !== 0 && item.outcome !== 1)
      throw new Error("Outcome must be binary");
    if (!Array.isArray(item.inputs) || item.inputs.length === 0)
      throw new Error("Evaluation needs historical input evidence");
    caseIds.add(item.caseId);
    if (splits.has(item.cycleId) && splits.get(item.cycleId) !== item.split) {
      throw new Error("Election cycle appears in more than one split");
    }
    splits.set(item.cycleId, item.split);
    const asOf = timestamp(item.inputAsOf, "inputAsOf");
    const electionDate = Date.parse(`${item.electionDate}T00:00:00Z`);
    if (
      !calendarDateSchema.safeParse(item.electionDate).success ||
      !Number.isFinite(electionDate)
    ) {
      throw new Error("Invalid election date");
    }
    datesBySplit.set(item.split, [
      ...(datesBySplit.get(item.split) ?? []),
      electionDate,
    ]);
    const cutoff = timestamp(item.forecastCutoffAt, "forecastCutoffAt");
    if (asOf >= cutoff || cutoff > electionDate)
      throw new Error("Prediction is outside pre-election forecast cutoff");
    if (timestamp(item.outcomeVerifiedAt, "outcomeVerifiedAt") <= asOf) {
      throw new Error(
        "Verified result was available before or at prediction time",
      );
    }
    if (timestamp(item.outcomeVerifiedAt, "outcomeVerifiedAt") < electionDate) {
      throw new Error("Result verification precedes election");
    }
    for (const input of item.inputs) {
      if (
        !input.referenceId ||
        timestamp(input.availableAt, "availableAt") > asOf
      ) {
        throw new Error("Historical input was unavailable as of prediction");
      }
      const acquired = timestamp(input.acquiredAt, "acquiredAt");
      if (acquired < timestamp(input.availableAt, "availableAt"))
        throw new Error("Historical acquisition precedes availability");
      if (
        ![
          "actual_acquisition",
          "documented_historical",
          "assumed_historical",
        ].includes(input.evidence)
      )
        throw new Error("Unknown historical availability evidence");
      if (input.evidence === "assumed_historical")
        throw new Error("Assumed availability is not causal evaluation");
      if (
        input.evidence === "actual_acquisition" &&
        (acquired > asOf || input.acquiredAt !== input.availableAt)
      ) {
        throw new Error("Acquisition follows prediction time");
      }
      if (
        input.evidence === "documented_historical" &&
        (!input.archive ||
          !httpsReference(input.archive.url) ||
          !validId(input.archive.version) ||
          !/^[a-f0-9]{64}$/.test(input.archive.sha256) ||
          input.archive.availabilityReview?.status !== "verified" ||
          !httpsReference(input.archive.availabilityReview.evidenceUrl) ||
          input.archive.availabilityReview.availableAt !== input.availableAt ||
          timestamp(input.archive.availabilityReview.reviewedAt, "reviewedAt") <
            timestamp(
              input.archive.availabilityReview.availableAt,
              "reviewed availability",
            ))
      ) {
        throw new Error(
          "Historical availability needs reviewed archive provenance",
        );
      }
      if (input.evidence === "actual_acquisition" && input.archive !== null)
        throw new Error(
          "Actual acquisition must not claim an archive reconstruction",
        );
    }
    for (const probability of [
      item.probability,
      item.baselineProbability,
    ].filter((value) => value !== undefined)) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1)
        throw new Error("Probability must be a fraction in [0, 1]");
    }
    if (item.lower80 !== null || item.upper80 !== null) {
      if (
        item.lower80 === null ||
        item.upper80 === null ||
        item.observedSeats === null ||
        !Number.isFinite(item.lower80) ||
        !Number.isFinite(item.upper80) ||
        item.lower80 > item.upper80
      ) {
        throw new Error("Invalid interval");
      }
    }
    if ((item.observedSeats === null) !== (item.predictedSeats === null))
      throw new Error("Seat pair is incomplete");
    if (
      item.observedSeats !== null &&
      (!Number.isFinite(item.observedSeats) ||
        !Number.isFinite(item.predictedSeats))
    ) {
      throw new Error("Seat counts must be finite");
    }
  }
  for (const [earlier, later] of [
    ["development", "tuning"],
    ["development", "test"],
    ["tuning", "test"],
  ] as const) {
    const first = datesBySplit.get(earlier);
    const second = datesBySplit.get(later);
    if (first && second && Math.max(...first) >= Math.min(...second)) {
      throw new Error("Evaluation splits are not chronological");
    }
  }
}

/** Scores test cycles only; the confidence interval resamples whole elections. */
export function evaluateHeldOut(
  cases: readonly EvaluationCase[],
  seed: string,
  bootstrapSamples = 2000,
): EvaluationReport {
  assertCausalEvaluation(cases);
  if (
    !seed ||
    !Number.isInteger(bootstrapSamples) ||
    bootstrapSamples < 100 ||
    bootstrapSamples > 10_000
  ) {
    throw new Error("Invalid evaluation seed or bootstrap budget");
  }
  const heldOut = cases.filter((item) => item.split === "test");
  if (heldOut.length === 0) throw new Error("No held-out test cases");
  const byCycle = new Map<string, EvaluationCase[]>();
  for (const item of heldOut)
    byCycle.set(item.cycleId, [...(byCycle.get(item.cycleId) ?? []), item]);
  const cycleDifferences = [...byCycle.values()].map((cycle) =>
    average(
      cycle.map(
        (item) =>
          brier(item.probability, item.outcome) -
          brier(item.baselineProbability, item.outcome),
      ),
    ),
  );
  const differenceByCycle = average(cycleDifferences);
  let confidence: readonly [number, number] | null = null;
  if (cycleDifferences.length >= 3) {
    const random = seededUniform(seed);
    const resamples = Array.from({ length: bootstrapSamples }, () =>
      average(
        Array.from(
          { length: cycleDifferences.length },
          () =>
            cycleDifferences[Math.floor(random() * cycleDifferences.length)],
        ),
      ),
    );
    resamples.sort((a, b) => a - b);
    confidence = [
      resamples[Math.floor(0.025 * (bootstrapSamples - 1))],
      resamples[Math.ceil(0.975 * (bootstrapSamples - 1))],
    ];
  }
  const calibration = Array.from({ length: 5 }, (_, index) => {
    const lower = index / 5;
    const upper = (index + 1) / 5;
    const members = heldOut.filter(
      (item) =>
        item.probability >= lower &&
        (index === 4 ? item.probability <= upper : item.probability < upper),
    );
    return {
      lower,
      upper,
      count: members.length,
      meanPredicted: members.length
        ? average(members.map((item) => item.probability))
        : null,
      observedRate: members.length
        ? average(members.map((item) => item.outcome))
        : null,
    } satisfies CalibrationBin;
  });
  const ece = calibration.reduce(
    (sum, bin) =>
      sum +
      (bin.count / heldOut.length) *
        Math.abs((bin.meanPredicted ?? 0) - (bin.observedRate ?? 0)),
    0,
  );
  const intervals = heldOut.filter(
    (item) => item.lower80 !== null && item.upper80 !== null,
  );
  const seats = heldOut.filter(
    (item) => item.observedSeats !== null && item.predictedSeats !== null,
  );
  const markets = heldOut.filter(isComparableMarket);
  const brierScore = average(
    heldOut.map((item) => brier(item.probability, item.outcome)),
  );
  const baselineBrierScore = average(
    heldOut.map((item) => brier(item.baselineProbability, item.outcome)),
  );
  return {
    evidenceAudit: "external_review_required",
    cases: heldOut.length,
    cycles: byCycle.size,
    brier: brierScore,
    baselineBrier: baselineBrierScore,
    brierDifferencePerCase: brierScore - baselineBrierScore,
    brierDifferencePerCycle: differenceByCycle,
    brierDifferencePerCycle95: confidence,
    logLoss: average(
      heldOut.map((item) => logLoss(item.probability, item.outcome)),
    ),
    baselineLogLoss: average(
      heldOut.map((item) => logLoss(item.baselineProbability, item.outcome)),
    ),
    expectedCalibrationError: ece,
    calibration,
    interval80Coverage: intervals.length
      ? average(
          intervals.map((item) =>
            Number(
              item.observedSeats! >= item.lower80! &&
                item.observedSeats! <= item.upper80!,
            ),
          ),
        )
      : null,
    seatMeanAbsoluteError: seats.length
      ? average(
          seats.map((item) =>
            Math.abs(item.predictedSeats! - item.observedSeats!),
          ),
        )
      : null,
    marketBrierEquivalentOnly: markets.length
      ? average(
          markets.map((item) => brier(item.market!.probability, item.outcome)),
        )
      : null,
    marketComparableCases: markets.length,
  };
}
