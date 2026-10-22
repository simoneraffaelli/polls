import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SOURCE_SEEDS,
  seedObservatoryStructure,
  sourceIdFor,
} from "../../src/composition/sources";
import {
  createArticleCollectionPageStore,
  readObservatoryArticlePage,
} from "../../src/infrastructure/database/article-repository";
import { beginCollectionRun } from "../../src/infrastructure/database/collection-repository";
import { readObservatorySources } from "../../src/infrastructure/database/observatory-repository";
import {
  collectionRuns,
  configuredSources,
  sourceSectionBindings,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe("article collection and bounded observatory reads", () => {
  let database: IsolatedDatabase;
  const sourceId = sourceIdFor(SOURCE_SEEDS[1].key);
  beforeAll(async () => {
    database = await createIsolatedDatabase();
    await seedObservatoryStructure(database.db);
    await database.db
      .update(configuredSources)
      .set({ enabled: true })
      .where(eq(configuredSources.id, sourceId));
    await database.db
      .update(sourceSectionBindings)
      .set({ enabled: true })
      .where(eq(sourceSectionBindings.sourceId, sourceId));
  }, 30_000);
  afterAll(async () => {
    await database?.cleanup();
  }, 30_000);

  it("lists enabled sources before their first observation", async () => {
    const sources = await readObservatorySources(database.db, {
      scope: us2026,
      asOf: new Date().toISOString(),
      limit: 10,
      staleAfterMinutes: 60,
    });
    expect(
      sources.items.find((item) => item.source.id === sourceId),
    ).toMatchObject({
      family: "articles",
      observationCount: 0,
      source: { state: { status: "unavailable" } },
    });
  });

  it("commits a page atomically, replays it once, reads article link and retains it when paused", async () => {
    const store = createArticleCollectionPageStore(database.db);
    const run = await beginCollectionRun(database.db, sourceId);
    const externalId = `article-${randomUUID()}`;
    const acquiredAt = new Date().toISOString();
    const page = {
      observations: [
        {
          provenance: {
            sourceId,
            sourceUrl: "https://www.federalreserve.gov/feeds/press_all.xml",
            externalId,
            sourceRevision: null,
            observed: { kind: "instant" as const, at: acquiredAt },
            declaredPublication: { kind: "instant" as const, at: acquiredAt },
            acquiredAt,
            ingestionRunId: run.runId,
            parserVersion: "test-rss-1",
            transformationVersion: "test-normalizer-1",
            contentHash: "a".repeat(64),
          },
          publisher: "Federal Reserve Board",
          title: "Monetary policy announcement",
          url: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261022a.htm",
          excerpt: null,
          excerptReusePermitted: false,
        },
      ],
      quarantined: [
        {
          externalId: null,
          contentHash: "b".repeat(64),
          reasonCode: "invalid_category",
        },
      ],
      nextCursor: "feed-1",
      hasMore: false,
      acquiredAt,
    };
    const destinations = [{ scope: us2026, raceId: null }];
    const first = await store.commitPage({ run, page, destinations });
    expect(first).toMatchObject({
      saved: 1,
      quarantinedCount: 1,
      repeated: false,
    });
    expect(await store.readCommittedPage(run)).toMatchObject({
      saved: 1,
      quarantinedCount: 1,
      repeated: true,
      nextCursor: "feed-1",
    });
    expect(await store.commitPage({ run, page, destinations })).toMatchObject({
      saved: 1,
      repeated: true,
    });
    const articles = await readObservatoryArticlePage(database.db, {
      scope: us2026,
      asOf: new Date(Date.parse(acquiredAt) + 1000).toISOString(),
      limit: 10,
      staleAfterMinutes: 60,
    });
    expect(articles.items).toHaveLength(1);
    expect(articles.items[0]).toMatchObject({
      title: "Monetary policy announcement",
      url: page.observations[0].url,
      publishedAt: acquiredAt,
      excerpt: null,
      source: { state: { status: "current" } },
    });
    const failureAt = new Date(Date.parse(acquiredAt) + 2000);
    await database.db.insert(collectionRuns).values({
      sourceId,
      status: "failed",
      startedAt: failureAt,
      completedAt: failureAt,
      errorCode: "schema",
    });
    await database.db.insert(collectionRuns).values({
      sourceId,
      status: "running",
      startedAt: new Date(failureAt.getTime() + 100),
    });
    const afterFailure = await readObservatorySources(database.db, {
      scope: us2026,
      asOf: new Date(failureAt.getTime() + 200).toISOString(),
      limit: 10,
      staleAfterMinutes: 60,
    });
    expect(
      afterFailure.items.find((item) => item.source.id === sourceId),
    ).toMatchObject({
      observationCount: 1,
      source: { state: { status: "error", lastErrorCode: "schema" } },
    });
    await database.db
      .update(configuredSources)
      .set({ enabled: false })
      .where(eq(configuredSources.id, sourceId));
    await seedObservatoryStructure(database.db);
    expect(
      (
        await readObservatoryArticlePage(database.db, {
          scope: us2026,
          asOf: new Date(Date.parse(acquiredAt) + 1000).toISOString(),
          limit: 10,
          staleAfterMinutes: 60,
        })
      ).items[0]?.source.state.status,
    ).toBe("paused");
  });
});
