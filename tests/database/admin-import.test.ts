import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createIsolatedDatabase,
  pollObservation,
  seedDatabase,
  type IsolatedDatabase,
  us2026,
} from "./harness";
import {
  commitAdminPollImport,
  previewAdminPollImport,
} from "../../src/infrastructure/auth/admin-import";
import {
  adminAudit,
  configuredSources,
  pollRevisions,
  providers,
  sourceSectionBindings,
  user,
} from "../../src/infrastructure/database/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "controlled admin poll import",
  () => {
    let database: IsolatedDatabase;
    let sourceId: string;
    const actorUserId = "test-admin";
    beforeAll(async () => {
      database = await createIsolatedDatabase();
      await seedDatabase(database);
      await database.db.insert(user).values({
        id: actorUserId,
        name: "Admin",
        email: "import-admin@example.org",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await database.db.insert(providers).values({
        id: "provider:manual-import",
        family: "polls",
        name: "Manual import",
      });
      sourceId = randomUUID();
      await database.db.insert(configuredSources).values({
        id: sourceId,
        providerId: "provider:manual-import",
        name: "Manual poll import",
        enabled: true,
      });
      await database.db
        .insert(sourceSectionBindings)
        .values({ sourceId, sectionId: us2026.sectionId, enabled: true });
    });
    afterAll(async () => {
      await database?.cleanup();
    });

    it("binds preview to exact content and atomically records data, receipt and audit", async () => {
      const content = JSON.stringify([
        pollObservation(
          sourceId,
          randomUUID(),
          "manual-one",
          "a",
          "2026-10-22T12:00:00.000Z",
        ),
      ]);
      const input = {
        sourceId,
        ...us2026,
        raceId: null,
        format: "json" as const,
        content,
      };
      const preview = await previewAdminPollImport(
        database.db,
        actorUserId,
        input,
      );
      expect(preview.preview.validRows).toBe(1);
      expect(preview.previewId).toBeTruthy();
      await expect(
        commitAdminPollImport(database.db, actorUserId, {
          ...input,
          previewId: preview.previewId,
          content: `${content} `,
          reason: "archivio verificato",
        }),
      ).rejects.toThrow();
      expect((await database.db.select().from(pollRevisions)).length).toBe(0);
      const committed = await commitAdminPollImport(database.db, actorUserId, {
        ...input,
        previewId: preview.previewId,
        reason: "archivio verificato",
      });
      expect(committed.saved).toBe(1);
      const replay = await commitAdminPollImport(database.db, actorUserId, {
        ...input,
        previewId: preview.previewId,
        reason: "archivio verificato",
      });
      expect(replay.repeated).toBe(true);
      expect((await database.db.select().from(pollRevisions)).length).toBe(1);
      expect(
        (
          await database.db
            .select()
            .from(adminAudit)
            .where(eq(adminAudit.action, "poll_import.commit"))
        ).length,
      ).toBe(1);
    });
  },
);
