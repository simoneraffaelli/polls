import type { ModelResult, ModelSnapshot } from "./contracts";

export type ModelQualityDecision =
  | Readonly<{ status: "experimental_candidate"; warnings: readonly string[] }>
  | Readonly<{ status: "blocked"; reasons: readonly string[] }>;

/** Eligibility for a candidate result; publication still requires the DB cutoff transaction. */
export function assessModelQuality(
  snapshot: ModelSnapshot,
  result: ModelResult,
): ModelQualityDecision {
  const reasons = [...result.diagnostics.issues];
  if (snapshot.kind !== "forecast") reasons.push("retrospective_only");
  if (result.questionOutcomeProbabilities.length === 0)
    reasons.push("control_not_resolved");
  if (result.modelStatus !== "experimental")
    reasons.push("unsupported_model_status");
  return reasons.length > 0
    ? { status: "blocked", reasons: [...new Set(reasons)].sort() }
    : {
        status: "experimental_candidate",
        warnings: result.diagnostics.warnings,
      };
}
