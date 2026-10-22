import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModelSnapshot } from "../../src/elections/model/contracts";
import { MIDTERMS_BASELINE_PARAMETERS } from "../../src/modules/usa/midterms/model/baseline";
import { recordPollRevision } from "../../src/infrastructure/database/poll-repository";
import { registerStructuralReference } from "../../src/infrastructure/database/structural-reference";
import { registerPollOptionMapping } from "../../src/infrastructure/database/option-mapping";
import { readPublishedModel } from "../../src/infrastructure/database/published-model";
import { runBaselineModel } from "../../src/infrastructure/jobs/model-runner";
import {
  adminMemberships,
  forecastQuestions,
  races,
  runModelSnapshots,
  user,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  pollObservation,
  seedDatabase,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "reviewed model evidence and published read on PostgreSQL",
  () => {
    let database: IsolatedDatabase;
    let snapshot: ModelSnapshot;
    let questionId: string;
    let cutoffAt: Date;

    beforeAll(async () => {
      database = await createIsolatedDatabase();
      const { sourceId, ingestionRunId } = await seedDatabase(database);
      const reviewerUserId = `reviewer-${randomUUID()}`;
      await database.db.insert(user).values({
        id: reviewerUserId,
        name: "Test reviewer",
        email: `${reviewerUserId}@example.org`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await database.db
        .insert(adminMemberships)
        .values({ userId: reviewerUserId });
      const [race] = await database.db
        .insert(races)
        .values({
          editionId: us2026.editionId,
          slug: `model-race-${randomUUID()}`,
          name: "Synthetic test race",
        })
        .returning({ id: races.id });
      cutoffAt = new Date(Date.now() + 5 * 60_000);
      const [question] = await database.db
        .insert(forecastQuestions)
        .values({
          editionId: us2026.editionId,
          slug: `model-question-${randomUUID()}`,
          outcomeDefinition: "seat_majority",
          resolutionRuleVersion: "test-rule-v1",
          cutoffAt,
          cutoffLocal: cutoffAt.toISOString().slice(0, 19),
          cutoffTimeZone: "UTC",
          cutoffCalendarReference: "https://example.org/test-calendar",
          cutoffVersion: 1,
        })
        .returning({ id: forecastQuestions.id });
      questionId = question.id;
      const acquiredAt = new Date(Date.now() - 10_000).toISOString();
      const generic = pollObservation(
        sourceId,
        ingestionRunId,
        `model-${randomUUID()}`,
        "a",
        acquiredAt,
      );
      const observation = {
        ...generic,
        questions: [{ ...generic.questions[0], kind: "vote_intent" as const }],
      };
      const poll = await recordPollRevision(database.db, observation, {
        scope: us2026,
        raceId: race.id,
      });
      const structuralRace = {
        raceId: race.id,
        regionId: "test-region",
        priorMarginPoints: 0,
        priorSdPoints: 10,
        priorAvailableAt: "2026-10-01T00:00:00Z",
        priorVersion: "synthetic-prior-v1",
        structuralStatus: "verified" as const,
        mapVersion: "synthetic-map-v1",
        resolutionRuleVersion: "test-rule-v1",
        binaryResolutionVerified: true,
        positive: { partyId: "A", caucusId: "A" },
        negative: { partyId: "B", caucusId: "B" },
      };
      const control = {
        version: "test-rule-v1",
        outcomeKind: "seat_majority" as const,
        resolutionRuleVerified: true,
        totalSeats: 1,
        majorityThreshold: 1,
        holdovers: [],
        holdoversAsOf: "2026-10-01T00:00:00Z",
        holdoversVerified: true,
        tieAt: null,
        tieBreakerCaucusId: null,
        tieRuleVerified: true,
      };
      const structural = await registerStructuralReference(database.db, {
        questionId,
        scope: us2026,
        version: "synthetic-structure-v1",
        sourceUrl: "https://example.org/test-structural-evidence",
        sourceVersion: "fixture-v1",
        availableAt: "2026-10-02T00:00:00Z",
        payload: {
          catalogVersion: "synthetic-catalog-v1",
          races: [structuralRace],
          control,
        },
        reviewerUserId,
      });
      const mapping = await registerPollOptionMapping(database.db, {
        structuralReferenceId: structural.id,
        revisionId: poll.revisionId,
        externalQuestionId: "generic-ballot",
        raceId: race.id,
        positiveOptionId: "option-a",
        negativeOptionId: "option-b",
        reviewerUserId,
        reason: "Synthetic fixture orientation",
      });
      // The as-of is taken after the reviewer receipts and link have committed.
      await new Promise((resolve) => setTimeout(resolve, 5));
      snapshot = {
        questionId,
        scope: us2026,
        kind: "forecast",
        inputAsOf: new Date().toISOString(),
        cutoffAt: cutoffAt.toISOString(),
        catalogVersion: "synthetic-catalog-v1",
        structuralReferenceId: structural.id,
        qualityPolicyVersion: "poll-quality-v1",
        modelVersion: "baseline-test-v1",
        parameterVersion: MIDTERMS_BASELINE_PARAMETERS.version,
        parameters: MIDTERMS_BASELINE_PARAMETERS,
        seed: "synthetic-seed-v1",
        races: [structuralRace],
        polls: [
          {
            signalId: "synthetic-signal",
            revisionId: poll.revisionId,
            pollLinkId: poll.linkId,
            optionMappingId: mapping.id,
            externalQuestionId: "generic-ballot",
            positiveOptionId: "option-a",
            negativeOptionId: "option-b",
            raceId: race.id,
            pollsterId: "Test pollster",
            sampleGroupId: "shared-study-sample",
            population: "registered_voters",
            sampleSize: 1000,
            quality: 1,
            observedEndDate: "2026-10-12",
            acquiredAt,
            availableAt: acquiredAt,
            availability: "actual_acquisition",
            marginPoints: 1,
          },
        ],
        control,
      };
    }, 30_000);

    afterAll(async () => {
      await database?.cleanup();
    }, 30_000);

    it("publishes reviewed evidence atomically and reads only its sealed current/frozen run", async () => {
      const swapped = {
        ...snapshot,
        seed: "swapped-seed",
        polls: [
          {
            ...snapshot.polls[0],
            positiveOptionId: "option-b",
            negativeOptionId: "option-a",
            marginPoints: -1,
          },
        ],
      };
      await expect(
        runBaselineModel(database.db, { snapshot: swapped, iterations: 100 }),
      ).rejects.toThrow(/orientation/);
      const completed = await runBaselineModel(database.db, {
        snapshot,
        iterations: 100,
      });
      expect(completed.quality.status).toBe("experimental_candidate");
      expect(completed.publicationId).toBeTruthy();
      const retry = await runBaselineModel(database.db, {
        snapshot,
        iterations: 100,
      });
      expect(retry).toMatchObject({
        repeated: true,
        publicationId: completed.publicationId,
        run: { runId: completed.run.runId },
      });
      const published = await readPublishedModel(database.db, {
        scope: us2026,
        questionId,
      });
      expect(published).toMatchObject({
        publication: {
          state: "current",
          publicationId: completed.publicationId,
          runId: completed.run.runId,
        },
        proof: { structuralReferenceId: snapshot.structuralReferenceId },
      });
      expect(published?.result.modelStatus).toBe("experimental");
      await expect(
        database.db
          .update(runModelSnapshots)
          .set({ snapshot: { changed: true } })
          .where(eq(runModelSnapshots.runId, completed.run.runId)),
      ).rejects.toThrow();
      await expect(
        database.db
          .update(forecastQuestions)
          .set({ outcomeDefinition: "changed-after-run" })
          .where(eq(forecastQuestions.id, questionId)),
      ).rejects.toThrow();
      await database.db
        .update(forecastQuestions)
        .set({
          cutoffAt: new Date(Date.now() - 1000),
          cutoffVersion: 2,
        })
        .where(eq(forecastQuestions.id, questionId));
      expect(
        (await readPublishedModel(database.db, { scope: us2026, questionId }))
          ?.publication.state,
      ).toBe("frozen");
      const [closedQuestion] = await database.db
        .select({ cutoffAt: forecastQuestions.cutoffAt })
        .from(forecastQuestions)
        .where(eq(forecastQuestions.id, questionId));
      const reconstruction = {
        ...snapshot,
        kind: "retrospective_reconstruction" as const,
        seed: "retrospective-seed",
        cutoffAt: closedQuestion.cutoffAt.toISOString(),
      };
      const result = await runBaselineModel(database.db, {
        snapshot: reconstruction,
        iterations: 100,
      });
      expect(result.quality.status).toBe("blocked");
      expect(result.publicationId).toBeNull();
    });
  },
);
