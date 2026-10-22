import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedObservatoryStructure,
  sourceIdFor,
} from "../../src/composition/sources";
import { MARKET_QUALITY_POLICY_VERSION } from "../../src/integrations/polymarket/book";
import {
  createCompletedForecastRun,
  publishForecast,
} from "../../src/infrastructure/database/forecast-repository";
import {
  readMarketComparison,
  recordMarketQuote,
} from "../../src/infrastructure/database/market-repository";
import { recordPollRevision } from "../../src/infrastructure/database/poll-repository";
import {
  collectionRuns,
  configuredSources,
  forecastQuestions,
  marketContracts,
  marketOutcomes,
  marketQuotes,
  marketQuestionLinks,
  questionCutoffRevisions,
  sourceSectionBindings,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  pollObservation,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe("configured market quote storage and comparison gates", () => {
  let database: IsolatedDatabase;
  const sourceId = sourceIdFor("source:polymarket:clob-book");
  beforeAll(async () => {
    database = await createIsolatedDatabase();
    await seedObservatoryStructure(database.db);
    await database.db
      .update(configuredSources)
      .set({ enabled: true })
      .where(eq(configuredSources.id, sourceId));
  }, 30_000);
  afterAll(async () => {
    await database?.cleanup();
  }, 30_000);

  it("stores only preconfigured synthetic outcomes, deduplicates snapshots and leaves display gated", async () => {
    const [contract] = await database.db
      .insert(marketContracts)
      .values({
        sourceId,
        externalId: "synthetic-condition-1",
        title: "Synthetic House control",
        resolutionRules:
          "Synthetic test only; no live contract equivalence asserted",
      })
      .returning({ id: marketContracts.id });
    await database.db.insert(marketOutcomes).values({
      contractId: contract.id,
      sourceId,
      externalId: "synthetic-token-yes-1",
      label: "Yes",
    });
    const [run] = await database.db
      .insert(collectionRuns)
      .values({
        sourceId,
        status: "succeeded",
      })
      .returning({ id: collectionRuns.id });
    const observation = {
      provenance: {
        sourceId,
        sourceUrl:
          "https://clob.polymarket.com/book?token_id=synthetic-token-yes-1",
        externalId: "synthetic-token-yes-1",
        sourceRevision: "synthetic-book-hash-1",
        observed: { kind: "instant" as const, at: "2026-10-22T12:00:00.000Z" },
        declaredPublication: null,
        acquiredAt: "2026-10-22T12:10:00.000Z",
        ingestionRunId: run.id,
        parserVersion: "polymarket-book-v1",
        transformationVersion: "polymarket-book-v1",
        contentHash: "a".repeat(64),
      },
      marketId: "synthetic-condition-1",
      outcomeId: "synthetic-token-yes-1",
      snapshotId: `synthetic-${randomUUID()}`,
      qualityPolicyVersion: MARKET_QUALITY_POLICY_VERSION,
      price: {
        kind: "bid_ask_midpoint" as const,
        bid: 0.45,
        ask: 0.46,
        midpoint: 0.455,
        spread: 0.01,
        comparisonStatus: "eligible" as const,
        exclusionReason: null,
      },
    };
    expect((await recordMarketQuote(database.db, observation)).inserted).toBe(
      true,
    );
    expect((await recordMarketQuote(database.db, observation)).inserted).toBe(
      false,
    );
    expect(await database.db.select().from(marketQuotes)).toHaveLength(1);
    await expect(
      recordMarketQuote(database.db, {
        ...observation,
        provenance: { ...observation.provenance, contentHash: "b".repeat(64) },
      }),
    ).rejects.toThrow("Conflicting market quote");
    await expect(
      recordMarketQuote(database.db, {
        ...observation,
        provenance: {
          ...observation.provenance,
          observed: { kind: "instant", at: "2026-10-22T12:11:00.000Z" },
        },
      }),
    ).rejects.toThrow("ineligible provider time");
    await expect(
      recordMarketQuote(database.db, {
        ...observation,
        marketId: "unconfigured-condition",
      }),
    ).rejects.toThrow("not configured");
    const [question] = await database.db
      .insert(forecastQuestions)
      .values({
        editionId: us2026.editionId,
        slug: `synthetic-${randomUUID()}`,
        outcomeDefinition: "Synthetic test outcome",
        resolutionRuleVersion: "test-v1",
        cutoffAt: new Date("2026-11-03T00:00:00.000Z"),
        cutoffLocal: "2026-11-02T19:00:00",
        cutoffTimeZone: "America/New_York",
        cutoffCalendarReference:
          "https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/",
        cutoffVersion: 1,
      })
      .returning({ id: forecastQuestions.id });
    expect(
      await readMarketComparison(database.db, {
        scope: us2026,
        questionId: question.id,
        asOf: "2026-10-22T12:15:00.000Z",
      }),
    ).toMatchObject({ status: "unpublished", midpoint: null });
    await database.db.insert(questionCutoffRevisions).values({
      questionId: question.id,
      version: 1,
      cutoffAt: new Date("2026-11-03T00:00:00.000Z"),
      cutoffLocal: "2026-11-02T19:00:00",
      timeZone: "America/New_York",
      calendarReference:
        "https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/",
    });
    const pollSourceId = sourceIdFor("source:votehub:generic-ballot:2026");
    const [pollRun] = await database.db
      .insert(collectionRuns)
      .values({
        sourceId: pollSourceId,
        status: "succeeded",
      })
      .returning({ id: collectionRuns.id });
    const poll = await recordPollRevision(
      database.db,
      pollObservation(
        pollSourceId,
        pollRun.id,
        `market-input-${randomUUID()}`,
        "a",
        "2026-10-20T10:00:00.000Z",
      ),
      { scope: us2026, raceId: null },
    );
    const forecastRun = await createCompletedForecastRun(database.db, {
      questionId: question.id,
      scope: us2026,
      kind: "forecast",
      inputAsOf: new Date().toISOString(),
      pollInputs: [{ revisionId: poll.revisionId, pollLinkId: poll.linkId }],
      inputSnapshotHash: "c".repeat(64),
      modelVersion: "synthetic-baseline-v1",
      parameterVersion: "synthetic-parameters-v1",
      modelStatus: "experimental",
      seed: "synthetic-seed",
      qualityStatus: "complete",
      results: [{ outcomeId: "yes", probability: 0.5 }],
    });
    const publication = await publishForecast(database.db, {
      questionId: question.id,
      runId: forecastRun.runId,
    });
    await database.db.insert(sourceSectionBindings).values({
      sourceId,
      sectionId: us2026.sectionId,
      enabled: true,
    });
    const [configuredOutcome] = await database.db
      .select({ id: marketOutcomes.id })
      .from(marketOutcomes)
      .where(eq(marketOutcomes.sourceId, sourceId));
    await database.db.insert(marketQuestionLinks).values({
      outcomeId: configuredOutcome.id,
      questionId: question.id,
      editionId: us2026.editionId,
      equivalenceStatus: "equivalent",
      checkedAt: publication.publishedAt,
      explanation:
        "Synthetic test mapping; no real market equivalence asserted",
    });
    const goodAt = publication.publishedAt.toISOString();
    const goodObservedAt = new Date(
      publication.publishedAt.getTime() - 1000,
    ).toISOString();
    const good = {
      ...observation,
      snapshotId: `synthetic-good-${randomUUID()}`,
      provenance: {
        ...observation.provenance,
        sourceRevision: `good-${randomUUID()}`,
        contentHash: "c".repeat(64),
        observed: { kind: "instant" as const, at: goodObservedAt },
        acquiredAt: goodAt,
      },
    };
    await recordMarketQuote(database.db, good);
    expect(
      await readMarketComparison(database.db, {
        scope: us2026,
        questionId: question.id,
        asOf: goodAt,
        rightsVerified: true,
        timestampFormatVerified: true,
      }),
    ).toMatchObject({
      status: "eligible",
      midpoint: 0.455,
      outcomeLabel: "Yes",
      marketOutcomeId: configuredOutcome.id,
      marketOutcomeExternalId: "synthetic-token-yes-1",
    });
    const badAt = new Date(
      publication.publishedAt.getTime() + 1000,
    ).toISOString();
    await recordMarketQuote(database.db, {
      ...observation,
      snapshotId: `synthetic-bad-${randomUUID()}`,
      provenance: {
        ...observation.provenance,
        sourceRevision: `bad-${randomUUID()}`,
        contentHash: "d".repeat(64),
        observed: { kind: "instant", at: badAt },
        acquiredAt: badAt,
      },
      price: {
        kind: "unavailable",
        expectedPriceType: "bid_ask_midpoint",
        reason: "wide_spread",
        bid: 0.4,
        ask: 0.6,
      },
    });
    expect(
      await readMarketComparison(database.db, {
        scope: us2026,
        questionId: question.id,
        asOf: badAt,
        rightsVerified: true,
        timestampFormatVerified: true,
      }),
    ).toMatchObject({ status: "unavailable", midpoint: null });
    expect(
      await readMarketComparison(database.db, {
        scope: us2026,
        questionId: question.id,
        asOf: "2026-11-03T00:00:00.000Z",
        rightsVerified: true,
        timestampFormatVerified: true,
      }),
    ).toMatchObject({ status: "closed", midpoint: null });
  });
});
