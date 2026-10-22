import { createHash } from "node:crypto";
import { loadPinnedSenateV8 } from "./pinned-file";
import type { SenateResult } from "./senate";

export type PreparedSenateResult = Readonly<{
  result: SenateResult;
  contentHash: string;
}>;

/** Stable, content-addressed rows before any database connection is opened. */
export function prepareSenateResults(
  results: readonly SenateResult[],
): readonly PreparedSenateResult[] {
  const keys = new Set<string>();
  return results.map((result) => {
    if (keys.has(result.contestKey))
      throw new Error("Duplicate MEDSL Senate contest key");
    keys.add(result.contestKey);
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          contestKey: result.contestKey,
          year: result.year,
          stateCode: result.stateCode,
          stage: result.stage,
          sourceStageCodes: result.sourceStageCodes,
          special: result.special,
          totalVotes: result.totalVotes,
          unattributedVotes: result.unattributedVotes,
          candidates: result.candidates,
          margin: result.margin,
          sourceVersions: result.sourceVersions,
        }),
      )
      .digest("hex");
    return { result, contentHash };
  });
}

export function preparePinnedSenateV8Import(): readonly PreparedSenateResult[] {
  const rows = prepareSenateResults(loadPinnedSenateV8());
  if (rows.length !== 862)
    throw new Error("MEDSL Senate V8 contest count changed");
  return rows;
}
