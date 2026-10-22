import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readAdminForecastRunSummary } from "../../src/infrastructure/auth/admin-forecast-repository";
import {
  createCompletedForecastRun,
  publishForecast,
} from "../../src/infrastructure/database/forecast-repository";
import { recordPollRevision } from "../../src/infrastructure/database/poll-repository";
import { forecastQuestions } from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  pollObservation,
  seedDatabase,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe("admin forecast metadata summary", () => {
  let database: IsolatedDatabase;
  let sourceId: string;
  let ingestionRunId: string;
  beforeAll(async () => {
    database = await createIsolatedDatabase();
    ({ sourceId, ingestionRunId } = await seedDatabase(database));
  }, 30_000);
  afterAll(async () => {
    await database?.cleanup();
  }, 30_000);

  it("shows a published forecast and an unpublished reconstruction without model payloads", async () => {
    const cutoffAt = new Date(Date.now() + 60_000);
    const [question] = await database.db
      .insert(forecastQuestions)
      .values({
        editionId: us2026.editionId,
        slug: `admin-summary-${randomUUID()}`,
        outcomeDefinition: "Controllo della Camera",
        resolutionRuleVersion: "admin-summary-test-v1",
        cutoffAt,
        cutoffLocal: cutoffAt.toISOString().slice(0, 19),
        cutoffTimeZone: "UTC",
        cutoffCalendarReference: "https://example.org/election-calendar",
        cutoffVersion: 1,
      })
      .returning({ id: forecastQuestions.id });
    const poll = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        ingestionRunId,
        `admin-summary-${randomUUID()}`,
        "a",
        new Date(Date.now() - 30_000).toISOString(),
      ),
      { scope: us2026, raceId: null },
    );
    // The link uses PostgreSQL microseconds. Cross its millisecond boundary,
    // then read the database clock so inputAsOf is after the link but not future.
    await database.db.execute(sql`SELECT pg_sleep(0.002)`);
    const clock = await database.db.execute(
      sql`SELECT EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS epoch_ms`,
    );
    const inputAsOf = new Date(Number(clock.rows[0]?.epoch_ms)).toISOString();
    const common = {
      questionId: question.id,
      scope: us2026,
      inputAsOf,
      pollInputs: [{ revisionId: poll.revisionId, pollLinkId: poll.linkId }],
      inputSnapshotHash: "a".repeat(64),
      modelVersion: "admin-summary-test-v1",
      parameterVersion: "test-params-v1",
      modelStatus: "experimental" as const,
      seed: "admin-summary-seed",
    };
    const forecast = await createCompletedForecastRun(database.db, {
      ...common,
      kind: "forecast",
      qualityStatus: "complete",
      results: [{ outcomeId: "control:yes", probability: 0.55 }],
    });
    const publication = await publishForecast(database.db, {
      questionId: question.id,
      runId: forecast.runId,
    });
    const retrospective = await createCompletedForecastRun(database.db, {
      ...common,
      kind: "retrospective_reconstruction",
      qualityStatus: "incomplete",
      results: [],
    });
    const summary = await readAdminForecastRunSummary(database.db);
    const published = summary.find((row) => row.runId === forecast.runId);
    const reconstruction = summary.find(
      (row) => row.runId === retrospective.runId,
    );
    expect(published).toMatchObject({
      questionLabel: "Controllo della Camera",
      kind: "forecast",
      status: "published",
      qualityStatus: "complete",
      modelStatus: "experimental",
      publicationId: publication.publicationId,
    });
    expect(published?.publishedAt).toBeTruthy();
    expect(reconstruction).toMatchObject({
      kind: "retrospective_reconstruction",
      status: "sealed_unpublished",
      qualityStatus: "incomplete",
      publicationId: null,
      publishedAt: null,
    });
    expect(summary.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(summary)).not.toMatch(
      /inputSnapshotHash|diagnostics|snapshot|seed/,
    );
  });
});
