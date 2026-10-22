import type {
  BaselineParameters,
  ControlDefinition,
  ModelDiagnostics,
  ModelResult,
  ModelSnapshot,
  RaceEstimate,
} from "./contracts";
import { simulateEstimates } from "./simulate";

/** Derived, public model quantities only. No poll records, option IDs or raw priors. */
export type PublicScenarioBasis = Readonly<{
  publicationId: string;
  runId: string;
  readState: "current" | "frozen";
  modelStatus: "experimental";
  modelVersion: string;
  seed: string;
  parameters: BaselineParameters;
  estimates: readonly RaceEstimate[];
  diagnostics: ModelDiagnostics;
  control: ControlDefinition | null;
}>;

export function publicScenarioBasis(input: {
  publicationId: string;
  runId: string;
  readState: "current" | "frozen";
  snapshot: ModelSnapshot;
  result: ModelResult;
}): PublicScenarioBasis {
  const { snapshot, result } = input;
  if (
    snapshot.kind !== "forecast" ||
    result.modelStatus !== "experimental" ||
    result.parametersVersion !== snapshot.parameters.version ||
    result.seed !== snapshot.seed
  ) {
    throw new Error("Public scenario basis requires a matching forecast");
  }
  return {
    publicationId: input.publicationId,
    runId: input.runId,
    readState: input.readState,
    modelStatus: result.modelStatus,
    modelVersion: snapshot.modelVersion,
    seed: snapshot.seed,
    parameters: snapshot.parameters,
    estimates: result.races,
    diagnostics: result.diagnostics,
    control: snapshot.control,
  };
}

export function simulatePublicScenario(
  basis: PublicScenarioBasis,
  swingPoints: number,
  iterations: number,
): ModelResult {
  if (
    !basis.publicationId ||
    !basis.runId ||
    basis.modelStatus !== "experimental" ||
    !Number.isFinite(swingPoints) ||
    Math.abs(swingPoints) > 5 ||
    !Number.isInteger(iterations) ||
    iterations < 100 ||
    iterations > 2000 ||
    iterations * basis.estimates.length > 1_000_000
  ) {
    throw new Error("Scenario parameters exceed bounds");
  }
  return simulateEstimates({
    modelVersion: basis.modelVersion,
    parameters: basis.parameters,
    seed: basis.seed,
    estimates: basis.estimates,
    diagnostics: basis.diagnostics,
    control: basis.control,
    iterations,
    uniformSwingPoints: swingPoints,
  });
}
