import type { EditionScope } from "../../platform/data/primitives";

/** A margin is in percentage points (0–100 scale), never a probability. */
export type RaceModelInput = Readonly<{
  raceId: string;
  regionId: string;
  priorMarginPoints: number;
  priorSdPoints: number;
  priorAvailableAt: string;
  priorVersion: string;
  structuralStatus: "verified" | "assumed";
  mapVersion: string | null;
  resolutionRuleVersion: string;
  binaryResolutionVerified: boolean;
  positive: Readonly<{ partyId: string; caucusId: string | null }>;
  negative: Readonly<{ partyId: string; caucusId: string | null }>;
}>;

export type PollModelInput = Readonly<{
  signalId: string;
  revisionId: string;
  raceId: string;
  pollsterId: string;
  sampleGroupId: string;
  population: "likely_voters" | "registered_voters" | "adults" | "other";
  sampleSize: number | null;
  quality: number;
  observedEndDate: string;
  acquiredAt: string;
  availableAt: string;
  availability:
    "actual_acquisition" | "documented_historical" | "assumed_historical";
  marginPoints: number;
}>;

export type Holdover = Readonly<{
  partyId: string;
  caucusId: string | null;
  count: number;
}>;

export type ControlDefinition = Readonly<{
  version: string;
  outcomeKind: "seat_majority" | "chamber_control";
  resolutionRuleVerified: boolean;
  totalSeats: number;
  majorityThreshold: number;
  holdovers: readonly Holdover[];
  holdoversAsOf: string;
  holdoversVerified: boolean;
  /** Only a verified, explicit rule can resolve a tied chamber. */
  tieAt: number | null;
  tieBreakerCaucusId: string | null;
  tieRuleVerified: boolean;
}>;

export type ModelSnapshot = Readonly<{
  questionId: string;
  scope: EditionScope;
  kind: "forecast" | "retrospective_reconstruction";
  inputAsOf: string;
  cutoffAt: string;
  catalogVersion: string;
  modelVersion: string;
  parameterVersion: string;
  parameters: BaselineParameters;
  seed: string;
  races: readonly RaceModelInput[];
  polls: readonly PollModelInput[];
  control: ControlDefinition | null;
}>;

export type BaselineParameters = Readonly<{
  version: string;
  halfLifeDays: number;
  sampleCap: number;
  pollSdAtWeightOne: number;
  missingPollSdMultiplier: number;
  nationalErrorSd: number;
  regionalErrorSd: number;
  localErrorSd: number;
  populationWeights: Readonly<Record<PollModelInput["population"], number>>;
}>;

export type RaceEstimate = Readonly<{
  raceId: string;
  regionId: string;
  meanMarginPoints: number;
  posteriorSdPoints: number;
  effectivePollWeight: number;
  pollGroups: number;
  hasLocalPolls: boolean;
  positive: RaceModelInput["positive"];
  negative: RaceModelInput["negative"];
}>;

export type ModelDiagnostics = Readonly<{
  quality: "complete" | "incomplete";
  issues: readonly string[];
  warnings: readonly string[];
  modeledRaces: number;
  expectedContestedSeats: number | null;
  racesWithLocalPolls: number;
  assumedInputs: number;
}>;

export type SeatSummary = Readonly<{
  id: string;
  mean: number;
  lower80: number;
  upper80: number;
}>;

export type ModelResult = Readonly<{
  modelStatus: "experimental";
  parametersVersion: string;
  seed: string;
  iterations: number;
  diagnostics: ModelDiagnostics;
  races: readonly RaceEstimate[];
  raceWinProbabilities: readonly Readonly<{
    raceId: string;
    positiveProbability: number;
  }>[];
  partySeats: readonly SeatSummary[];
  caucusSeats: readonly SeatSummary[];
  questionOutcomeKind: ControlDefinition["outcomeKind"] | null;
  questionOutcomeProbabilities: readonly Readonly<{
    outcomeId: string;
    probability: number;
  }>[];
}>;
