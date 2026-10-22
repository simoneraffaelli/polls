import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedObservatoryStructure,
  sourceIdFor,
} from "../../src/composition/sources";
import {
  applyAdminPollCommand,
  readAdminPollLinks,
} from "../../src/infrastructure/auth/admin-poll-repository";
import { recordPollRevision } from "../../src/infrastructure/database/poll-repository";
import {
  readObservatoryPollPage,
  readPollEditorialHistory,
} from "../../src/infrastructure/database/observatory-repository";
import {
  collectionRuns,
  pollEditionLinks,
  pollForecastExclusions,
  pollLinkDecisions,
  pollRevisions,
  races,
  user,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  pollObservation,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe("single-poll editorial overlay", () => {
  let database: IsolatedDatabase;
  const actorUserId = `admin-${randomUUID()}`;
  beforeAll(async () => {
    database = await createIsolatedDatabase();
    await seedObservatoryStructure(database.db);
    await database.db.insert(user).values({
      id: actorUserId,
      name: "Editor",
      email: `${actorUserId}@example.invalid`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }, 30_000);
  afterAll(async () => {
    await database?.cleanup();
  }, 30_000);

  it("keeps raw revision and original link while adding scoped exclusion and correction", async () => {
    const sourceId = sourceIdFor("source:votehub:generic-ballot:2026");
    const [run] = await database.db
      .insert(collectionRuns)
      .values({ sourceId, status: "succeeded" })
      .returning({ id: collectionRuns.id });
    const recorded = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        run.id,
        `overlay-${randomUUID()}`,
        "a",
        "2026-10-20T10:00:00.000Z",
      ),
      { scope: us2026, raceId: null },
    );
    const beforeDecision = new Date().toISOString();
    const exclusion = await applyAdminPollCommand(database.db, actorUserId, {
      action: "poll.excluded",
      scope: us2026,
      pollId: recorded.pollId,
      excluded: true,
      reason: "Campione non comparabile",
    });
    expect(exclusion?.pollId).toBe(recorded.pollId);
    const [race] = await database.db
      .select({ id: races.id })
      .from(races)
      .where(eq(races.editionId, us2026.editionId))
      .limit(1);
    expect(race).toBeDefined();
    const corrected = await applyAdminPollCommand(database.db, actorUserId, {
      action: "poll.reassociate",
      scope: us2026,
      pollId: recorded.pollId,
      oldLinkId: recorded.linkId,
      raceId: race.id,
      reason: "Competizione verificata",
    });
    expect(corrected?.linkId).not.toBe(recorded.linkId);
    const afterDecision = new Date(Date.now() + 1000).toISOString();
    const historicalView = await readObservatoryPollPage(database.db, {
      scope: us2026,
      limit: 10,
      asOf: beforeDecision,
      staleAfterMinutes: 100_000,
    });
    expect(
      historicalView.items.filter((item) => item.pollId === recorded.pollId),
    ).toHaveLength(1);
    const currentView = await readObservatoryPollPage(database.db, {
      scope: us2026,
      limit: 10,
      asOf: afterDecision,
      staleAfterMinutes: 100_000,
    });
    expect(
      currentView.items
        .filter((item) => item.pollId === recorded.pollId)
        .map((item) => item.currentLinkIncluded)
        .sort(),
    ).toEqual([false, true]);
    expect(
      currentView.items.find(
        (item) => item.pollId === recorded.pollId && item.currentLinkIncluded,
      )?.excludedFromFutureForecasts,
    ).toBe(true);
    const trail = await readPollEditorialHistory(database.db, {
      scope: us2026,
      pollId: recorded.pollId,
      limit: 10,
      asOf: afterDecision,
      staleAfterMinutes: 100_000,
    });
    expect(trail.items).toHaveLength(3);
    expect(trail.items.map((item) => item.kind).sort()).toEqual([
      "association",
      "association",
      "forecast_exclusion",
    ]);
    expect(JSON.stringify({ currentView, trail })).not.toContain(
      "Campione non comparabile",
    );
    expect(JSON.stringify({ currentView, trail })).not.toContain(
      "Competizione verificata",
    );
    expect(
      await database.db
        .select()
        .from(pollRevisions)
        .where(eq(pollRevisions.pollId, recorded.pollId)),
    ).toHaveLength(1);
    expect(
      await database.db
        .select()
        .from(pollEditionLinks)
        .where(eq(pollEditionLinks.pollId, recorded.pollId)),
    ).toHaveLength(2);
    expect(
      await database.db
        .select()
        .from(pollForecastExclusions)
        .where(eq(pollForecastExclusions.pollId, recorded.pollId)),
    ).toHaveLength(1);
    expect(
      (
        await database.db
          .select()
          .from(pollLinkDecisions)
          .where(eq(pollLinkDecisions.pollId, recorded.pollId))
      ).map((item) => item.included),
    ).toEqual([false, true]);
    expect(
      (await readAdminPollLinks(database.db)).items.some(
        (item) => item.poll_id === recorded.pollId && item.included === false,
      ),
    ).toBe(true);
    await expect(
      applyAdminPollCommand(database.db, actorUserId, {
        action: "poll.reassociate",
        scope: us2026,
        pollId: recorded.pollId,
        oldLinkId: recorded.linkId,
        raceId: race.id,
        reason: "Stale retry",
      }),
    ).rejects.toThrow("already superseded");
    await expect(
      applyAdminPollCommand(database.db, actorUserId, {
        action: "poll.reassociate",
        scope: us2026,
        pollId: recorded.pollId,
        oldLinkId: corrected!.linkId,
        raceId: race.id,
        reason: "No actual change",
      }),
    ).rejects.toThrow("unchanged");
  });

  it("serializes competing corrections to the same original link", async () => {
    const sourceId = sourceIdFor("source:votehub:generic-ballot:2026");
    const [run] = await database.db
      .insert(collectionRuns)
      .values({ sourceId, status: "succeeded" })
      .returning({ id: collectionRuns.id });
    const recorded = await recordPollRevision(
      database.db,
      pollObservation(
        sourceId,
        run.id,
        `race-${randomUUID()}`,
        "a",
        "2026-10-20T10:00:00.000Z",
      ),
      { scope: us2026, raceId: null },
    );
    const choices = await database.db
      .select({ id: races.id })
      .from(races)
      .where(eq(races.editionId, us2026.editionId))
      .limit(2);
    expect(choices).toHaveLength(2);
    const results = await Promise.allSettled(
      choices.map((race) =>
        applyAdminPollCommand(database.db, actorUserId, {
          action: "poll.reassociate",
          scope: us2026,
          pollId: recorded.pollId,
          oldLinkId: recorded.linkId,
          raceId: race.id,
          reason: "Concurrent correction",
        }),
      ),
    );
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    const links = (await readAdminPollLinks(database.db)).items.filter(
      (item) => item.poll_id === recorded.pollId,
    );
    expect(links.filter((item) => item.included !== false)).toHaveLength(1);
  });
});
