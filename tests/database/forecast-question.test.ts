import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerForecastQuestion } from "../../src/infrastructure/database/forecast-question";
import {
  adminAudit,
  adminMemberships,
  forecastQuestions,
  questionCutoffRevisions,
  user,
} from "../../src/infrastructure/database/schema";
import {
  createIsolatedDatabase,
  seedDatabase,
  us2026,
  type IsolatedDatabase,
} from "./harness";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "controlled forecast question registration on PostgreSQL",
  () => {
    let database: IsolatedDatabase;
    let actorUserId: string;

    beforeAll(async () => {
      database = await createIsolatedDatabase();
      await seedDatabase(database);
      actorUserId = `model-question-${randomUUID()}`;
      await database.db.insert(user).values({
        id: actorUserId,
        name: "Test administrator",
        email: `${actorUserId}@example.org`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await database.db
        .insert(adminMemberships)
        .values({ userId: actorUserId });
    }, 30_000);

    afterAll(async () => {
      if (database) await database.cleanup();
    }, 30_000);

    it("records an audited cutoff and closes questions registered after it", async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const request = {
        scope: us2026,
        raceId: null,
        slug: `test-question-${randomUUID()}`,
        outcomeDefinition: "chamber_control",
        resolutionRuleVersion: "test-rule-v1",
        cutoff: {
          version: 1,
          localDateTime: past.slice(0, 19),
          timeZone: "UTC",
          utcInstant: past,
          calendarReference: "https://example.org/calendar-fixture",
        },
        actorUserId,
        reason: "Controlled test registration",
      };
      const registered = await registerForecastQuestion(database.db, request);
      expect(registered.state).toBe("closed");
      const [question] = await database.db
        .select()
        .from(forecastQuestions)
        .where(eq(forecastQuestions.id, registered.id));
      expect(question.storedState).toBe("closed");
      const [revision] = await database.db
        .select()
        .from(questionCutoffRevisions)
        .where(eq(questionCutoffRevisions.questionId, registered.id));
      expect(revision.version).toBe(1);
      const [audit] = await database.db
        .select()
        .from(adminAudit)
        .where(eq(adminAudit.targetId, registered.id));
      expect(audit.action).toBe("forecast_question.register");
      await expect(
        registerForecastQuestion(database.db, {
          ...request,
          slug: `test-question-${randomUUID()}`,
          cutoff: { ...request.cutoff, localDateTime: "2026-01-01T00:00:00" },
        }),
      ).rejects.toThrow();
      await database.db
        .update(adminMemberships)
        .set({ revokedAt: new Date() })
        .where(eq(adminMemberships.userId, actorUserId));
      await expect(
        registerForecastQuestion(database.db, {
          ...request,
          slug: `test-question-${randomUUID()}`,
        }),
      ).rejects.toThrow(/active administrator/);
    }, 30_000);
  },
);
