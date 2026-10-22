import type { SourceState } from "../../platform/observatory/read-contracts";

export function sourceState(input: {
  acquiredAt: Date | null;
  sourceEnabled: boolean;
  bindingEnabled: boolean;
  lastRunStatus: string | null;
  lastErrorCode: string | null;
  asOf: Date;
  staleAfterMinutes: number;
}): SourceState {
  const lastErrorCode = input.lastErrorCode;
  const acquiredAt = input.acquiredAt?.toISOString() ?? null;
  if (!input.sourceEnabled || !input.bindingEnabled)
    return { status: "paused", acquiredAt, lastErrorCode };
  if (input.lastRunStatus === "failed")
    return { status: "error", acquiredAt, lastErrorCode };
  if (!input.acquiredAt)
    return { status: "unavailable", acquiredAt: null, lastErrorCode };
  const age = input.asOf.getTime() - input.acquiredAt.getTime();
  if (age > input.staleAfterMinutes * 60_000)
    return { status: "stale", acquiredAt, lastErrorCode };
  return { status: "current", acquiredAt, lastErrorCode };
}
