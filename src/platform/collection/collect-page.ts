import { z } from "zod";
import {
  contentHashSchema,
  editionScopeSchema,
  internalIdSchema,
  utcInstantSchema,
} from "../data/primitives";
import type {
  CollectionPageStore,
  CollectionResult,
  CollectionRun,
  SourceAdapter,
  SourcePage,
} from "./contracts";
import { CollectionError } from "./errors";

const runSchema = z.object({
  sourceId: z.uuid(),
  runId: z.uuid(),
  cursorBefore: z.string().min(1).max(2048).nullable(),
  cursorGenerationBefore: z.number().int().nonnegative(),
});

export async function collectOnePage<T>(input: {
  adapter: SourceAdapter<T>;
  store: CollectionPageStore<T>;
  run: CollectionRun;
  destinations: readonly {
    scope: { sectionId: string; editionId: string };
    raceId: string | null;
  }[];
  signal: AbortSignal;
  maxObservationsPerPage: number;
}): Promise<CollectionResult> {
  const parsed = runSchema.safeParse(input.run);
  if (!parsed.success)
    throw new CollectionError("schema", "Invalid collection run");
  const destinations = z
    .array(z.object({ scope: editionScopeSchema, raceId: z.uuid().nullable() }))
    .min(1)
    .safeParse(input.destinations);
  if (
    !destinations.success ||
    new Set(
      destinations.data.map(
        ({ scope, raceId }) => `${scope.editionId}:${raceId ?? "national"}`,
      ),
    ).size !== destinations.data.length
  ) {
    throw new CollectionError(
      "schema",
      "Invalid or repeated collection destinations",
    );
  }
  if (
    !Number.isInteger(input.maxObservationsPerPage) ||
    input.maxObservationsPerPage < 1
  ) {
    throw new CollectionError("budget", "Invalid page observation limit");
  }
  const alreadyCommitted = await input.store.readCommittedPage(parsed.data);
  if (alreadyCommitted) return alreadyCommitted;
  if (input.signal.aborted)
    throw new CollectionError("aborted", "Collection aborted");

  const page = await input.adapter.fetchPage({
    cursor: parsed.data.cursorBefore,
    signal: input.signal,
    sourceId: parsed.data.sourceId,
    runId: parsed.data.runId,
  });
  validatePage(page, parsed.data, input.maxObservationsPerPage);
  if (input.signal.aborted)
    throw new CollectionError("aborted", "Collection aborted");
  const committed = await input.store.commitPage({
    run: parsed.data,
    page,
    destinations: destinations.data,
  });
  return { ...committed, nextCursor: page.nextCursor, hasMore: page.hasMore };
}

function validatePage<T>(
  page: SourcePage<T>,
  run: CollectionRun,
  maxItems: number,
): void {
  if (
    !page ||
    !Array.isArray(page.observations) ||
    !Array.isArray(page.quarantined) ||
    page.observations.length + page.quarantined.length > maxItems ||
    typeof page.hasMore !== "boolean" ||
    !utcInstantSchema.safeParse(page.acquiredAt).success ||
    (page.nextCursor !== null &&
      (typeof page.nextCursor !== "string" ||
        page.nextCursor.length < 1 ||
        page.nextCursor.length > 2048)) ||
    page.hasMore !== (page.nextCursor !== null) ||
    (page.hasMore && page.nextCursor === run.cursorBefore)
  ) {
    throw new CollectionError("schema", "Invalid provider page or cursor");
  }
  for (const quarantine of page.quarantined) {
    if (
      !quarantine ||
      (quarantine.externalId !== null &&
        !internalIdSchema.safeParse(quarantine.externalId).success) ||
      !contentHashSchema.safeParse(quarantine.contentHash).success ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(quarantine.reasonCode)
    ) {
      throw new CollectionError("schema", "Invalid quarantine metadata");
    }
  }
  for (const observation of page.observations) {
    const provenance =
      observation &&
      typeof observation === "object" &&
      "provenance" in observation
        ? observation.provenance
        : null;
    if (
      !provenance ||
      typeof provenance !== "object" ||
      !("sourceId" in provenance) ||
      provenance.sourceId !== run.sourceId ||
      !("ingestionRunId" in provenance) ||
      provenance.ingestionRunId !== run.runId ||
      !("acquiredAt" in provenance) ||
      provenance.acquiredAt !== page.acquiredAt
    ) {
      throw new CollectionError(
        "schema",
        "Observation provenance differs from collection page",
      );
    }
  }
}
