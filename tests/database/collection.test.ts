import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { collectOnePage } from "../../src/platform/collection/collect-page";
import type {
  CollectionDestination,
  CollectionRun,
  SourcePage,
} from "../../src/platform/collection/contracts";
import {
  beginCollectionRun,
  createPollCollectionPageStore,
  loadCollectionRun,
} from "../../src/infrastructure/database/collection-repository";
import {
  collectionRuns,
  configuredSources,
  pollEditionLinks,
  pollRecords,
  pollRevisions,
  quarantinedObservations,
  races,
  sourceCursors,
  sourceSectionBindings,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  it2026,
  pollObservation,
  seedDatabase,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe("atomic source pages on PostgreSQL", () => {
  let database: IsolatedDatabase;
  let sourceId: string;
  const destinations: CollectionDestination[] = [
    { scope: us2026, raceId: null },
    { scope: it2026, raceId: null },
  ];

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    ({ sourceId } = await seedDatabase(database));
    await database.db.insert(sourceSectionBindings).values([
      { sourceId, sectionId: us2026.sectionId, enabled: true },
      { sourceId, sectionId: it2026.sectionId, enabled: true },
    ]);
  }, 30_000);

  afterAll(async () => {
    if (database) await database.cleanup();
  }, 30_000);

  function page(
    run: CollectionRun,
    externalId: string,
    acquiredAt: string,
    nextCursor: string | null,
  ): SourcePage<ReturnType<typeof pollObservation>> {
    return {
      observations: [
        pollObservation(run.sourceId, run.runId, externalId, "a", acquiredAt),
      ],
      quarantined: [
        {
          externalId: "bad-record",
          contentHash: "b".repeat(64),
          reasonCode: "invalid_percentage",
        },
      ],
      nextCursor,
      hasMore: nextCursor !== null,
      acquiredAt,
    };
  }

  it("commits one fetched page to two editions with quarantine and never refetches a completed run", async () => {
    const run = await beginCollectionRun(database.db, sourceId);
    expect(run).toMatchObject({
      sourceId,
      cursorBefore: null,
      cursorGenerationBefore: 0,
    });
    expect(await loadCollectionRun(database.db, run.runId)).toEqual(run);
    const acquiredAt = new Date().toISOString();
    const fetched = page(
      run,
      `shared-${randomUUID()}`,
      acquiredAt,
      "next-page",
    );
    const fetchPage = vi.fn().mockResolvedValue(fetched);
    const store = createPollCollectionPageStore(database.db);
    const result = await collectOnePage({
      adapter: { family: "polls", parserVersion: "test-parser-1", fetchPage },
      store,
      run,
      destinations,
      signal: new AbortController().signal,
      maxObservationsPerPage: 10,
    });
    expect(result).toEqual({
      saved: 1,
      quarantinedCount: 1,
      repeated: false,
      nextCursor: "next-page",
      hasMore: true,
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);

    const [cursor] = await database.db
      .select()
      .from(sourceCursors)
      .where(eq(sourceCursors.sourceId, sourceId));
    expect(cursor).toMatchObject({
      cursor: "next-page",
      generation: 1,
      lastRunId: run.runId,
    });
    const [receipt] = await database.db
      .select()
      .from(collectionRuns)
      .where(eq(collectionRuns.id, run.runId));
    expect(receipt).toMatchObject({
      status: "succeeded",
      savedCount: 1,
      quarantinedCount: 1,
      hasMore: true,
    });
    expect(receipt.pageAcquiredAt?.toISOString()).toBe(acquiredAt);
    expect(
      await database.db
        .select()
        .from(quarantinedObservations)
        .where(eq(quarantinedObservations.runId, run.runId)),
    ).toHaveLength(1);
    const records = await database.db
      .select()
      .from(pollRecords)
      .where(eq(pollRecords.sourceId, sourceId));
    const record = records.find(
      (item) =>
        item.externalId === fetched.observations[0].provenance.externalId,
    );
    expect(record).toBeDefined();
    const links = await database.db
      .select()
      .from(pollEditionLinks)
      .where(eq(pollEditionLinks.pollId, record!.id));
    expect(links.map((item) => item.editionId).sort()).toEqual(
      [it2026.editionId, us2026.editionId].sort(),
    );
    expect(
      await database.db
        .select()
        .from(pollRevisions)
        .where(eq(pollRevisions.pollId, record!.id)),
    ).toHaveLength(1);

    const retryFetch = vi.fn();
    const repeated = await collectOnePage({
      adapter: {
        family: "polls",
        parserVersion: "test-parser-1",
        fetchPage: retryFetch,
      },
      store,
      run,
      destinations,
      signal: new AbortController().signal,
      maxObservationsPerPage: 10,
    });
    expect(repeated).toEqual({ ...result, repeated: true });
    expect(retryFetch).not.toHaveBeenCalled();
    expect(
      await store.commitPage({ run, page: fetched, destinations }),
    ).toEqual({ saved: 1, quarantinedCount: 1, repeated: true });
    expect(await beginCollectionRun(database.db, sourceId)).toMatchObject({
      cursorBefore: "next-page",
      cursorGenerationBefore: 1,
    });
  });

  it("rolls back on disabled binding and on failure after a poll write, then retries the same run", async () => {
    const [source] = await database.db
      .insert(configuredSources)
      .values({
        providerId: "provider:test-polls",
        name: "Isolation source",
        enabled: true,
      })
      .returning({ id: configuredSources.id });
    await database.db.insert(sourceSectionBindings).values([
      { sourceId: source.id, sectionId: us2026.sectionId, enabled: true },
      { sourceId: source.id, sectionId: it2026.sectionId, enabled: false },
    ]);
    const run = await beginCollectionRun(database.db, source.id);
    const store = createPollCollectionPageStore(database.db);
    const externalId = `retry-${randomUUID()}`;
    const firstPage = page(
      run,
      externalId,
      new Date(Date.now() - 5_000).toISOString(),
      "next",
    );
    await expect(
      store.commitPage({ run, page: firstPage, destinations }),
    ).rejects.toThrow();
    expect(
      await database.db
        .select()
        .from(pollRecords)
        .where(eq(pollRecords.sourceId, source.id)),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(quarantinedObservations)
        .where(eq(quarantinedObservations.runId, run.runId)),
    ).toHaveLength(0);
    const [cursorBefore] = await database.db
      .select()
      .from(sourceCursors)
      .where(eq(sourceCursors.sourceId, source.id));
    expect(cursorBefore).toMatchObject({ cursor: null, generation: 0 });
    const [pending] = await database.db
      .select()
      .from(collectionRuns)
      .where(eq(collectionRuns.id, run.runId));
    expect(pending.status).toBe("running");

    await database.db
      .update(sourceSectionBindings)
      .set({ enabled: true })
      .where(eq(sourceSectionBindings.sourceId, source.id));
    const firstValid = page(
      run,
      externalId,
      new Date(Date.now() - 1_000).toISOString(),
      "next",
    );
    const partialPage = {
      ...firstValid,
      observations: [
        ...firstValid.observations,
        pollObservation(
          source.id,
          randomUUID(),
          `invalid-${randomUUID()}`,
          "a",
          firstValid.acquiredAt,
        ),
      ],
    };
    await expect(
      store.commitPage({ run, page: partialPage, destinations }),
    ).rejects.toThrow();
    expect(
      await database.db
        .select()
        .from(pollRecords)
        .where(eq(pollRecords.sourceId, source.id)),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(quarantinedObservations)
        .where(eq(quarantinedObservations.runId, run.runId)),
    ).toHaveLength(0);
    const [cursorAfterRollback] = await database.db
      .select()
      .from(sourceCursors)
      .where(eq(sourceCursors.sourceId, source.id));
    expect(cursorAfterRollback).toMatchObject({ cursor: null, generation: 0 });
    const secondPage = page(run, externalId, new Date().toISOString(), "next");
    expect(
      await store.commitPage({ run, page: secondPage, destinations }),
    ).toMatchObject({ saved: 1, quarantinedCount: 1, repeated: false });
    const [completed] = await database.db
      .select()
      .from(collectionRuns)
      .where(eq(collectionRuns.id, run.runId));
    expect(completed.pageAcquiredAt?.toISOString()).toBe(secondPage.acquiredAt);
  });

  it("rejects stale cursor generations and validates a race even for an empty page", async () => {
    const [source] = await database.db
      .insert(configuredSources)
      .values({
        providerId: "provider:test-polls",
        name: "CAS source",
        enabled: true,
      })
      .returning({ id: configuredSources.id });
    await database.db.insert(sourceSectionBindings).values({
      sourceId: source.id,
      sectionId: us2026.sectionId,
      enabled: true,
    });
    const run = await beginCollectionRun(database.db, source.id);
    const store = createPollCollectionPageStore(database.db);
    const emptyPage = {
      observations: [],
      quarantined: [],
      nextCursor: null,
      hasMore: false,
      acquiredAt: new Date().toISOString(),
    };
    const [foreignRace] = await database.db
      .insert(races)
      .values({
        editionId: it2026.editionId,
        slug: `race-${randomUUID()}`,
        name: "Foreign race",
      })
      .returning({ id: races.id });
    await expect(
      store.commitPage({
        run,
        page: emptyPage,
        destinations: [{ scope: us2026, raceId: foreignRace.id }],
      }),
    ).rejects.toThrow();
    const [race] = await database.db
      .insert(races)
      .values({
        editionId: us2026.editionId,
        slug: `race-${randomUUID()}`,
        name: "Local race",
      })
      .returning({ id: races.id });
    await database.db
      .update(sourceCursors)
      .set({ generation: 1 })
      .where(eq(sourceCursors.sourceId, source.id));
    await expect(
      store.commitPage({
        run,
        page: emptyPage,
        destinations: [{ scope: us2026, raceId: race.id }],
      }),
    ).rejects.toThrow();
    expect(
      await database.db
        .select()
        .from(pollRecords)
        .where(eq(pollRecords.sourceId, source.id)),
    ).toHaveLength(0);
    const [stale] = await database.db
      .select()
      .from(collectionRuns)
      .where(eq(collectionRuns.id, run.runId));
    expect(stale.status).toBe("running");
  });
});
