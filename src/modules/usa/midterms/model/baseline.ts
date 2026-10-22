import type {
  BaselineParameters,
  ControlDefinition,
  Holdover,
} from "../../../../elections/model/contracts";

/** Initial, uncalibrated choices. They must remain experimental until causal evaluation. */
export const MIDTERMS_BASELINE_PARAMETERS: BaselineParameters = Object.freeze({
  version: "midterms-baseline-params-v1",
  halfLifeDays: 30,
  sampleCap: 3000,
  pollSdAtWeightOne: 6,
  missingPollSdMultiplier: 1.5,
  nationalErrorSd: 3,
  regionalErrorSd: 2,
  localErrorSd: 2,
  populationWeights: Object.freeze({
    likely_voters: 1,
    registered_voters: 0.75,
    adults: 0,
    other: 0,
  }),
});

/** Arithmetic seats won, not a claim about choosing the Speaker. */
export function houseSeatMajorityRule(): ControlDefinition {
  return {
    version: "house-435-majority-2026-v1",
    outcomeKind: "seat_majority",
    resolutionRuleVerified: true,
    totalSeats: 435,
    majorityThreshold: 218,
    holdovers: [],
    holdoversAsOf: "2026-01-01T00:00:00Z",
    holdoversVerified: true,
    tieAt: null,
    tieBreakerCaucusId: null,
    tieRuleVerified: true,
  };
}

/** Caller supplies a verified, date-stamped 65-seat holdover snapshot and VP context. */
export function senateCaucusMajorityRule(input: {
  holdovers: readonly Holdover[];
  asOf: string;
  verified: boolean;
  tieBreakerCaucusId: string | null;
  tieRuleVerified: boolean;
  version: string;
}): ControlDefinition {
  return {
    version: input.version,
    outcomeKind: "chamber_control",
    resolutionRuleVerified: input.verified,
    totalSeats: 100,
    majorityThreshold: 51,
    holdovers: input.holdovers,
    holdoversAsOf: input.asOf,
    holdoversVerified: input.verified,
    tieAt: 50,
    tieBreakerCaucusId: input.tieBreakerCaucusId,
    tieRuleVerified: input.tieRuleVerified,
  };
}
