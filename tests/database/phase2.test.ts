import { randomUUID } from "node:crypto";
import { eq, sql, asc } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCompletedForecastRun,
  publishForecast,
  readCurrentPublication,
} from "../../src/infrastructure/database/forecast-repository";
import { recordPollRevision } from "../../src/infrastructure/database/poll-repository";
import {
  collectionRuns,
  configuredSources,
  forecastQuestions,
  forecastResults,
  forecastRunPollInputs,
  forecastRuns,
  pollEditionLinks,
  pollOptions,
  pollRevisions,
  publicationHistory,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  it2026,
  pollObservation,
  seedDatabase,
  us2026,
  us2028,
  type IsolatedDatabase,
} from "./harness";

describe("phase 2 PostgreSQL invariants", () => {
  let database: IsolatedDatabase;
  let sourceId: string;
  let ingestionRunId: string;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
    ({ sourceId, ingestionRunId } = await seedDatabase(database));
  }, 30_000);

  afterAll(async () => {
    if (database) await database.cleanup();
  }, 30_000);

  async function newCollectionRun() {
    const [run] = await database.db
      .insert(collectionRuns)
      .values({ sourceId, status: "succeeded" })
      .returning({ id: collectionRuns.id });
    return run.id;
  }

  async function newQuestion(
    scope = us2026,
    cutoffAt = new Date(Date.now() + 60_000),
  ) {
    const [question] = await database.db
      .insert(forecastQuestions)
      .values({
        editionId: scope.editionId,
        slug: `question-${randomUUID()}`,
        outcomeDefinition: "outcome-a",
        resolutionRuleVersion: "rules-1",
        cutoffAt,
        cutoffLocal: cutoffAt.toISOString().slice(0, 19),
        cutoffTimeZone: "UTC",
        cutoffCalendarReference: "https://example.org/election-calendar",
        cutoffVersion: 1,
      })
      .returning({ id: forecastQuestions.id });
    return question.id;
  }

  function runInput(
    questionId: string,
    poll: { revisionId: string; linkId: string },
    inputAsOf: string,
    scope = us2026,
  ) {
    return {
      questionId,
      scope,
      kind: "forecast" as const,
      inputAsOf,
      pollInputs: [{ revisionId: poll.revisionId, pollLinkId: poll.linkId }],
      inputSnapshotHash: "c".repeat(64),
      modelVersion: "baseline-1",
      parameterVersion: "parameters-1",
      modelStatus: "experimental" as const,
      seed: "seed-1",
      qualityStatus: "complete" as const,
      results: [{ outcomeId: "outcome-a", probability: 0.54 }],
    };
  }

  it("keeps corrected poll revisions and one national association, then reuses the observation in another edition", async () => {
    const externalId = `poll-${randomUUID()}`;
    const acquiredA = new Date(Date.now() - 60_000).toISOString();
    const firstObservation = pollObservation(
      sourceId,
      ingestionRunId,
      externalId,
      "a",
      acquiredA,
    );
    const first = await recordPollRevision(database.db, firstObservation, {
      scope: us2026,
      raceId: null,
    });
    const retry = await recordPollRevision(database.db, firstObservation, {
      scope: us2026,
      raceId: null,
    });
    expect(retry).toMatchObject({
      pollId: first.pollId,
      revisionId: first.revisionId,
      linkId: first.linkId,
      revisionNo: 1,
      created: false,
    });

    const acquiredB = new Date(Date.now() - 40_000).toISOString();
    const second = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        await newCollectionRun(),
        externalId,
        "b",
        acquiredB,
      ),
      {
        scope: us2026,
        raceId: null,
      },
    );
    const delayedReplay = await recordPollRevision(
      database.db,
      firstObservation,
      { scope: us2026, raceId: null },
    );
    expect(delayedReplay).toMatchObject({
      revisionId: first.revisionId,
      revisionNo: 1,
      created: false,
    });
    const acquiredAgain = new Date(Date.now() - 20_000).toISOString();
    const thirdObservation = pollObservation(
      sourceId,
      await newCollectionRun(),
      externalId,
      "a",
      acquiredAgain,
    );
    const third = await recordPollRevision(database.db, thirdObservation, {
      scope: us2026,
      raceId: null,
    });
    expect([first.revisionNo, second.revisionNo, third.revisionNo]).toEqual([
      1, 2, 3,
    ]);
    expect(
      new Set([first.revisionId, second.revisionId, third.revisionId]).size,
    ).toBe(3);
    expect([second.linkId, third.linkId]).toEqual([first.linkId, first.linkId]);

    const shared = await recordPollRevision(database.db, thirdObservation, {
      scope: it2026,
      raceId: null,
    });
    expect(shared).toMatchObject({
      pollId: first.pollId,
      revisionId: third.revisionId,
      revisionNo: 3,
      created: false,
    });
    expect(shared.linkId).not.toBe(first.linkId);
    const revisions = await database.db
      .select()
      .from(pollRevisions)
      .where(eq(pollRevisions.pollId, first.pollId))
      .orderBy(asc(pollRevisions.revisionNo));
    const links = await database.db
      .select()
      .from(pollEditionLinks)
      .where(eq(pollEditionLinks.pollId, first.pollId));
    expect(revisions.map((revision) => revision.supersedesRevisionId)).toEqual([
      null,
      first.revisionId,
      second.revisionId,
    ]);
    expect(links).toHaveLength(2);

    await database.db
      .update(configuredSources)
      .set({ enabled: false })
      .where(eq(configuredSources.id, sourceId));
    expect(
      await database.db
        .select()
        .from(pollRevisions)
        .where(eq(pollRevisions.pollId, first.pollId)),
    ).toHaveLength(3);
    expect(
      await database.db
        .select()
        .from(pollEditionLinks)
        .where(eq(pollEditionLinks.pollId, first.pollId)),
    ).toHaveLength(2);
    await database.db
      .update(configuredSources)
      .set({ enabled: true })
      .where(eq(configuredSources.id, sourceId));
  });

  it("rejects cross-edition and future-acquired inputs while preserving revision and run history", async () => {
    const acquiredAt = new Date(Date.now() - 20_000).toISOString();
    const poll = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        ingestionRunId,
        `input-${randomUUID()}`,
        "a",
        acquiredAt,
      ),
      {
        scope: us2026,
      },
    );
    const asOf = new Date(Date.now() - 10_000).toISOString();
    const additionalPoll = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        ingestionRunId,
        `additional-${randomUUID()}`,
        "a",
        acquiredAt,
      ),
      { scope: us2026 },
    );
    const questionId = await newQuestion();
    const run = await createCompletedForecastRun(
      database.db,
      runInput(questionId, poll, asOf),
    );
    expect(run.runSequence).toBeGreaterThan(0);

    const otherQuestionId = await newQuestion(us2028);
    await expect(
      createCompletedForecastRun(
        database.db,
        runInput(otherQuestionId, poll, asOf, us2028),
      ),
    ).rejects.toThrow();
    const foreignCountryQuestionId = await newQuestion(it2026);
    await expect(
      createCompletedForecastRun(
        database.db,
        runInput(foreignCountryQuestionId, poll, asOf, it2026),
      ),
    ).rejects.toThrow();

    const acquiredFuture = new Date(Date.now() + 10_000).toISOString();
    const futurePoll = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        ingestionRunId,
        `future-${randomUUID()}`,
        "a",
        acquiredFuture,
      ),
      {
        scope: us2026,
      },
    );
    await expect(
      createCompletedForecastRun(
        database.db,
        runInput(questionId, futurePoll, asOf),
      ),
    ).rejects.toThrow();
    expect(
      await database.db
        .select()
        .from(forecastRunPollInputs)
        .where(eq(forecastRunPollInputs.runId, run.runId)),
    ).toHaveLength(1);

    await expect(
      database.db.insert(pollOptions).values({
        revisionId: poll.revisionId,
        externalQuestionId: "generic-ballot",
        optionId: "late-option",
        label: "Late option",
        percentage: "1",
      }),
    ).rejects.toThrow();
    await expect(
      database.db.insert(forecastRunPollInputs).values({
        runId: run.runId,
        editionId: us2026.editionId,
        pollLinkId: additionalPoll.linkId,
        pollId: additionalPoll.pollId,
        revisionId: additionalPoll.revisionId,
      }),
    ).rejects.toThrow();
    await expect(
      database.db.insert(forecastResults).values({
        runId: run.runId,
        outcomeId: "late-outcome",
        probability: "0.1",
      }),
    ).rejects.toThrow();

    await expect(
      database.db.execute(
        sql`UPDATE poll_revisions SET pollster = 'tampered' WHERE id = ${poll.revisionId}`,
      ),
    ).rejects.toThrow();
    await expect(
      database.db.execute(
        sql`DELETE FROM poll_revisions WHERE id = ${poll.revisionId}`,
      ),
    ).rejects.toThrow();
    await expect(
      database.db.execute(
        sql`UPDATE forecast_run_poll_inputs SET poll_id = poll_id WHERE run_id = ${run.runId}`,
      ),
    ).rejects.toThrow();
    await expect(
      database.db.execute(
        sql`DELETE FROM forecast_run_poll_inputs WHERE run_id = ${run.runId}`,
      ),
    ).rejects.toThrow();
    await expect(
      database.db.execute(
        sql`UPDATE forecast_runs SET model_version = 'tampered' WHERE id = ${run.runId}`,
      ),
    ).rejects.toThrow();
    expect(
      await database.db
        .select()
        .from(forecastRuns)
        .where(eq(forecastRuns.id, run.runId)),
    ).toMatchObject([{ modelVersion: "baseline-1" }]);
  });

  it("publishes in acquisition order and rejects older completions or earlier input snapshots", async () => {
    const poll = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        ingestionRunId,
        `publish-${randomUUID()}`,
        "a",
        new Date(Date.now() - 30_000).toISOString(),
      ),
      {
        scope: us2026,
      },
    );
    const questionId = await newQuestion();
    const asOfFirst = new Date(Date.now() - 20_000).toISOString();
    const first = await createCompletedForecastRun(
      database.db,
      runInput(questionId, poll, asOfFirst),
    );
    await publishForecast(database.db, { questionId, runId: first.runId });
    expect(await readCurrentPublication(database.db, questionId)).toEqual({
      kind: "current",
      runId: first.runId,
    });

    const asOfSecond = new Date(Date.now() - 10_000).toISOString();
    const second = await createCompletedForecastRun(
      database.db,
      runInput(questionId, poll, asOfSecond),
    );
    await publishForecast(database.db, { questionId, runId: second.runId });
    expect(await readCurrentPublication(database.db, questionId)).toEqual({
      kind: "current",
      runId: second.runId,
    });
    await expect(
      publishForecast(database.db, { questionId, runId: first.runId }),
    ).rejects.toThrow();

    const staleAsOf = new Date(Date.now() - 15_000).toISOString();
    const third = await createCompletedForecastRun(
      database.db,
      runInput(questionId, poll, staleAsOf),
    );
    await expect(
      publishForecast(database.db, { questionId, runId: third.runId }),
    ).rejects.toThrow();
    expect(await readCurrentPublication(database.db, questionId)).toEqual({
      kind: "current",
      runId: second.runId,
    });
    expect(
      await database.db
        .select()
        .from(publicationHistory)
        .where(eq(publicationHistory.questionId, questionId)),
    ).toHaveLength(2);
  });

  it("uses the database clock at the cutoff and reads a frozen publication without a worker", async () => {
    const poll = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        ingestionRunId,
        `cutoff-${randomUUID()}`,
        "a",
        new Date(Date.now() - 10_000).toISOString(),
      ),
      {
        scope: us2026,
      },
    );
    const questionId = await newQuestion();
    const run = await createCompletedForecastRun(
      database.db,
      runInput(questionId, poll, new Date(Date.now() - 5_000).toISOString()),
    );
    await publishForecast(database.db, { questionId, runId: run.runId });

    const imminentCutoff = new Date(Date.now() + 300);
    await database.db
      .update(forecastQuestions)
      .set({
        cutoffAt: imminentCutoff,
        cutoffLocal: imminentCutoff.toISOString().slice(0, 19),
        cutoffVersion: 2,
      })
      .where(eq(forecastQuestions.id, questionId));
    await database.pool.query("SELECT pg_sleep(0.4)");

    expect(await readCurrentPublication(database.db, questionId)).toEqual({
      kind: "frozen",
      runId: run.runId,
      archived: false,
    });
    const [stored] = await database.db
      .select({ state: forecastQuestions.storedState })
      .from(forecastQuestions)
      .where(eq(forecastQuestions.id, questionId));
    expect(stored.state).toBe("open");
    const lateRun = await createCompletedForecastRun(
      database.db,
      runInput(questionId, poll, new Date(Date.now() - 1_000).toISOString()),
    );
    await expect(
      publishForecast(database.db, { questionId, runId: lateRun.runId }),
    ).rejects.toThrow();

    const emptyQuestionId = await newQuestion(
      us2026,
      new Date(Date.now() - 1_000),
    );
    expect(await readCurrentPublication(database.db, emptyQuestionId)).toEqual({
      kind: "closed_without_run",
      archived: false,
    });
    const [expiredQuestion] = await database.db
      .select({ storedState: forecastQuestions.storedState })
      .from(forecastQuestions)
      .where(eq(forecastQuestions.id, emptyQuestionId));
    expect(expiredQuestion.storedState).toBe("closed");
  });

  it("rechecks the cutoff after waiting for the question lock", async () => {
    const poll = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        ingestionRunId,
        `locked-${randomUUID()}`,
        "a",
        new Date(Date.now() - 10_000).toISOString(),
      ),
      { scope: us2026 },
    );
    const questionId = await newQuestion();
    const run = await createCompletedForecastRun(
      database.db,
      runInput(questionId, poll, new Date(Date.now() - 5_000).toISOString()),
    );
    const cutoff = new Date(Date.now() + 1_200);
    await database.db
      .update(forecastQuestions)
      .set({
        cutoffAt: cutoff,
        cutoffLocal: cutoff.toISOString().slice(0, 19),
        cutoffVersion: 2,
      })
      .where(eq(forecastQuestions.id, questionId));

    const lockHolder = await database.pool.connect();
    try {
      await lockHolder.query("BEGIN");
      await lockHolder.query(
        "SELECT id FROM forecast_questions WHERE id = $1 FOR UPDATE",
        [questionId],
      );
      const attempt = publishForecast(database.db, {
        questionId,
        runId: run.runId,
      }).then(
        () => ({ published: true }),
        () => ({ published: false }),
      );
      // Hold the row lock until the database clock is just past the cutoff.
      await lockHolder.query(
        "SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp())) + 0.1)::double precision)",
        [cutoff],
      );
      await lockHolder.query("COMMIT");
      expect(await attempt).toEqual({ published: false });
    } finally {
      await lockHolder.query("ROLLBACK").catch(() => undefined);
      lockHolder.release();
    }
    expect(await readCurrentPublication(database.db, questionId)).toEqual({
      kind: "closed_without_run",
      archived: false,
    });
  }, 10_000);
});
