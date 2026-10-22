import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  readObservatoryPollPage,
  readObservatorySources,
  readPollRevisionHistory,
} from "../../src/infrastructure/database/observatory-repository";
import { recordPollRevision } from "../../src/infrastructure/database/poll-repository";
import {
  collectionRuns,
  configuredSources,
  sourceSectionBindings,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  pollObservation,
  seedDatabase,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe("bounded observatory poll reads", () => {
  let database: IsolatedDatabase;
  let sourceId: string;
  let runId: string;
  beforeAll(async () => {
    database = await createIsolatedDatabase();
    ({ sourceId, ingestionRunId: runId } = await seedDatabase(database));
    await database.db.insert(sourceSectionBindings).values({
      sourceId,
      sectionId: us2026.sectionId,
      enabled: true,
    });
  }, 30_000);
  afterAll(async () => {
    await database?.cleanup();
  }, 30_000);

  it("selects the latest sealed revision as of time, retains it while paused and enforces scope", async () => {
    const externalId = `obs-${randomUUID()}`;
    const firstAt = "2026-10-20T10:00:00.000Z";
    const secondAt = "2026-10-21T10:00:00.000Z";
    await recordPollRevision(
      database.db,
      pollObservation(sourceId, runId, externalId, "a", firstAt),
      { scope: us2026, raceId: null },
    );
    const [secondRun] = await database.db
      .insert(collectionRuns)
      .values({ sourceId, status: "succeeded" })
      .returning({ id: collectionRuns.id });
    await recordPollRevision(
      database.db,
      pollObservation(sourceId, secondRun.id, externalId, "b", secondAt),
      { scope: us2026, raceId: null },
    );
    await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        secondRun.id,
        `obs-${randomUUID()}`,
        "a",
        secondAt,
      ),
      { scope: us2026, raceId: null },
    );
    // This fixture explicitly states when both original associations existed.
    await database.db.execute(
      sql`UPDATE poll_edition_links SET created_at = '2026-10-20T09:00:00Z' WHERE edition_id = ${us2026.editionId}`,
    );
    const firstSnapshot = await readObservatoryPollPage(database.db, {
      scope: us2026,
      raceId: null,
      limit: 10,
      asOf: "2026-10-20T12:00:00.000Z",
      staleAfterMinutes: 60,
    });
    expect(firstSnapshot.items).toHaveLength(1);
    expect(firstSnapshot.items[0]).toMatchObject({
      revisionNo: 1,
      fieldworkStart: "2026-10-10",
      declaredPublication: "2026-10-13",
      source: { state: { status: "stale" } },
    });
    const latest = await readObservatoryPollPage(database.db, {
      scope: us2026,
      raceId: null,
      limit: 10,
      asOf: "2026-10-21T10:10:00.000Z",
      staleAfterMinutes: 60,
    });
    expect(latest.items).toHaveLength(2);
    expect(latest.items.find((poll) => poll.revisionNo === 2)).toMatchObject({
      questions: [{ options: [{ percentage: 49 }, { percentage: 46 }] }],
    });
    const correctedPoll = latest.items.find((poll) => poll.revisionNo === 2)!;
    const history = await readPollRevisionHistory(database.db, {
      scope: us2026,
      pollId: correctedPoll.pollId,
      limit: 10,
      asOf: "2026-10-21T10:10:00.000Z",
      staleAfterMinutes: 60,
    });
    expect(history.items.map((revision) => revision.revisionNo)).toEqual([
      2, 1,
    ]);
    const filteredPage = await readObservatoryPollPage(database.db, {
      scope: us2026,
      raceId: null,
      sourceId,
      populationKind: "registered_voters",
      fromDate: "2026-10-11",
      toDate: "2026-10-13",
      limit: 1,
      asOf: "2026-10-21T10:10:00.000Z",
      staleAfterMinutes: 60,
    });
    expect(filteredPage).toMatchObject({ hasMore: true, nextOffset: 1 });
    const nextPage = await readObservatoryPollPage(database.db, {
      scope: us2026,
      raceId: null,
      sourceId,
      populationKind: "registered_voters",
      fromDate: "2026-10-11",
      toDate: "2026-10-13",
      offset: filteredPage.nextOffset!,
      limit: 1,
      asOf: "2026-10-21T10:10:00.000Z",
      staleAfterMinutes: 60,
    });
    expect(nextPage).toMatchObject({ hasMore: false, nextOffset: null });
    expect(nextPage.items[0]?.pollId).not.toBe(filteredPage.items[0]?.pollId);
    await database.db
      .update(configuredSources)
      .set({ enabled: false, excludedFromForecasts: true })
      .where(eq(configuredSources.id, sourceId));
    const paused = await readObservatoryPollPage(database.db, {
      scope: us2026,
      raceId: null,
      limit: 10,
      asOf: "2026-10-21T10:10:00.000Z",
      staleAfterMinutes: 60,
    });
    expect(paused.items).toHaveLength(2);
    expect(paused.items[0]?.source.state.status).toBe("paused");
    expect(paused.items[0]?.source).toMatchObject({
      excludedFromForecasts: true,
      forecastExclusionReason: "source_excluded_from_future_forecasts",
    });
    const sources = await readObservatorySources(database.db, {
      scope: us2026,
      limit: 10,
      asOf: "2026-10-21T10:10:00.000Z",
      staleAfterMinutes: 60,
    });
    expect(sources.items).toHaveLength(1);
    expect(sources.items[0]).toMatchObject({
      family: "polls",
      observationCount: 2,
      source: { state: { status: "paused" } },
    });
    expect(
      await readObservatoryPollPage(database.db, {
        scope: {
          sectionId: "section:it:midterms",
          editionId: us2026.editionId,
        },
        limit: 10,
        asOf: "2026-10-21T10:10:00.000Z",
        staleAfterMinutes: 60,
      }),
    ).toMatchObject({ items: [] });
  });
});
