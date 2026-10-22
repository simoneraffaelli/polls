import { and, eq, inArray } from "drizzle-orm";
import { MIDTERMS_2026_EDITION_ID } from "../modules/usa/midterms/catalog-2026";
import { sourceIdFor } from "./sources";
import { createVoteHubGenericAdapter } from "../integrations/votehub/adapter";
import { createFederalReservePressAdapter } from "../integrations/fed/adapter";
import type { Database } from "../infrastructure/database/client";
import {
  configuredSources,
  sourceSectionBindings,
} from "../infrastructure/database/schema";
import type { HttpBudget } from "../infrastructure/http/source-client";
import type {
  CollectionSourceRegistry,
  CollectionSourceRegistration,
} from "../infrastructure/jobs/collection-queue";

const sectionId = "section:us:midterms";
export const COLLECTIBLE_SOURCE_IDS = {
  votehub: sourceIdFor("source:votehub:generic-ballot:2026"),
  fed: sourceIdFor("source:fed:press-all"),
} as const;

const budget: HttpBudget = {
  maxPages: 1,
  maxRequests: 2,
  maxBytes: 2_000_000,
  maxResponseBytes: 2_000_000,
  maxDurationMs: 30_000,
  maxAttemptsPerGet: 2,
};

/** Code-reviewed fixed adapters only; configured URLs cannot add a provider. */
export async function readCollectionSourceRegistry(
  db: Database,
): Promise<CollectionSourceRegistry> {
  const rows = await db
    .select({
      sourceId: configuredSources.id,
      providerId: configuredSources.providerId,
    })
    .from(configuredSources)
    .innerJoin(
      sourceSectionBindings,
      eq(sourceSectionBindings.sourceId, configuredSources.id),
    )
    .where(
      and(
        inArray(configuredSources.id, [
          COLLECTIBLE_SOURCE_IDS.votehub,
          COLLECTIBLE_SOURCE_IDS.fed,
        ]),
        eq(configuredSources.enabled, true),
        eq(sourceSectionBindings.sectionId, sectionId),
        eq(sourceSectionBindings.enabled, true),
      ),
    );
  const registry = new Map<string, CollectionSourceRegistration>();
  const destinations = [
    { scope: { sectionId, editionId: MIDTERMS_2026_EDITION_ID }, raceId: null },
  ];
  for (const row of rows) {
    if (
      row.sourceId === COLLECTIBLE_SOURCE_IDS.votehub &&
      row.providerId === "provider:votehub"
    ) {
      registry.set(row.sourceId, {
        family: "polls",
        adapter: createVoteHubGenericAdapter({ budget, maxRecords: 500 }),
        destinations,
        schedule: { cron: "0 6 * * *" },
      });
    } else if (
      row.sourceId === COLLECTIBLE_SOURCE_IDS.fed &&
      row.providerId === "provider:federal-reserve-board"
    ) {
      registry.set(row.sourceId, {
        family: "articles",
        adapter: createFederalReservePressAdapter({ budget, maxItems: 100 }),
        destinations,
        schedule: { cron: "0 7 * * *" },
      });
    }
  }
  return registry;
}

export function isKnownCollectibleSource(
  sourceId: string,
  providerId: string,
): boolean {
  return (
    (sourceId === COLLECTIBLE_SOURCE_IDS.votehub &&
      providerId === "provider:votehub") ||
    (sourceId === COLLECTIBLE_SOURCE_IDS.fed &&
      providerId === "provider:federal-reserve-board")
  );
}
