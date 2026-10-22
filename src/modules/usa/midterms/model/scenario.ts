import type {
  ModelSnapshot,
  ModelResult,
} from "../../../../elections/model/contracts";
import { simulateBaseline } from "../../../../elections/model/simulate";
import { snapshotDigest } from "../../../../elections/model/snapshot-hash";
import type { PublishedRunSnapshotReference } from "../../../../platform/forecast/scenario-reference";

export type PublishedBaseRun = PublishedRunSnapshotReference;

export type ScenarioResult = Readonly<{
  kind: "user_scenario";
  baseRunId: string;
  basePublicationId: string;
  historical: boolean;
  modelStatus: PublishedBaseRun["modelStatus"];
  swingPoints: number;
  result: ModelResult;
}>;

function assertPublishedBase(
  base: PublishedBaseRun,
  snapshot: ModelSnapshot,
): void {
  if (
    !base.publicationId ||
    !base.runId ||
    !base.questionId ||
    base.questionId !== snapshot.questionId ||
    base.scope.sectionId !== snapshot.scope.sectionId ||
    base.scope.editionId !== snapshot.scope.editionId ||
    base.kind !== snapshot.kind ||
    (base.kind === "forecast" && base.status !== "published") ||
    (base.kind === "retrospective_reconstruction" &&
      (base.status !== "published_reconstruction" ||
        base.readState !== "frozen"))
  ) {
    throw new Error("Scenario base is not a matching published run");
  }
}

function assertScenarioBudget(
  swingPoints: number,
  iterations: number,
  races: number,
  seed: string,
): void {
  if (
    !Number.isFinite(swingPoints) ||
    Math.abs(swingPoints) > 5 ||
    !Number.isInteger(iterations) ||
    iterations < 100 ||
    iterations > 2000 ||
    iterations * races > 1_000_000 ||
    !seed ||
    seed.length > 100
  ) {
    throw new Error("Scenario parameters exceed bounds");
  }
}

/** Caller retrieves the published run and sealed snapshot; this verifies their exact association. */
export async function runMidtermsScenario(input: {
  base: PublishedBaseRun;
  snapshot: ModelSnapshot;
  swingPoints: number;
  iterations: number;
  seed: string;
}): Promise<ScenarioResult> {
  const { base, snapshot, swingPoints, iterations, seed } = input;
  assertPublishedBase(base, snapshot);
  if (
    !/^[a-f0-9]{64}$/.test(base.inputSnapshotHash) ||
    (await snapshotDigest(snapshot)) !== base.inputSnapshotHash
  ) {
    throw new Error("Published run snapshot digest mismatch");
  }
  assertScenarioBudget(swingPoints, iterations, snapshot.races.length, seed);
  const result = simulateBaseline({ ...snapshot, seed }, iterations, {
    uniformSwingPoints: swingPoints,
  });
  return {
    kind: "user_scenario",
    baseRunId: base.runId,
    basePublicationId: base.publicationId,
    historical: base.readState === "frozen",
    modelStatus: base.modelStatus,
    swingPoints,
    result,
  };
}
