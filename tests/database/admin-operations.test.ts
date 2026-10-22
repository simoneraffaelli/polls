import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createIsolatedDatabase,
  seedDatabase,
  type IsolatedDatabase,
  us2026,
} from "./harness";
import { applyAdminCommand } from "../../src/infrastructure/auth/admin-repository";
import {
  adminAudit,
  configuredSources,
  sourceSectionBindings,
  user,
} from "../../src/infrastructure/database/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "administrator source controls",
  () => {
    let database: IsolatedDatabase;
    let sourceId: string;
    const actorUserId = "test-source-admin";
    beforeAll(async () => {
      database = await createIsolatedDatabase();
      ({ sourceId } = await seedDatabase(database));
      await database.db.insert(user).values({
        id: actorUserId,
        name: "Admin",
        email: "sources-admin@example.org",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    afterAll(async () => {
      await database?.cleanup();
    });

    it("suspends a source without deleting it and records future-use exclusions and binding corrections", async () => {
      expect(
        await applyAdminCommand(database.db, actorUserId, {
          action: "source.enabled",
          sourceId,
          enabled: false,
          reason: "licenza da verificare",
        }),
      ).toBe(true);
      expect(
        await applyAdminCommand(database.db, actorUserId, {
          action: "source.excluded",
          sourceId,
          excluded: true,
          reason: "nuovi calcoli sospesi",
        }),
      ).toBe(true);
      expect(
        await applyAdminCommand(database.db, actorUserId, {
          action: "binding.enabled",
          sourceId,
          sectionId: us2026.sectionId,
          enabled: false,
          reason: "associazione da correggere",
        }),
      ).toBe(true);
      const [source] = await database.db
        .select()
        .from(configuredSources)
        .where(eq(configuredSources.id, sourceId));
      expect(source.enabled).toBe(false);
      expect(source.excludedFromForecasts).toBe(true);
      const [binding] = await database.db
        .select()
        .from(sourceSectionBindings)
        .where(eq(sourceSectionBindings.sourceId, sourceId));
      expect(binding.enabled).toBe(false);
      expect((await database.db.select().from(adminAudit)).length).toBe(3);
      expect(
        await applyAdminCommand(database.db, actorUserId, {
          action: "binding.enabled",
          sourceId,
          sectionId: "missing-section",
          enabled: true,
          reason: "prova negativa",
        }),
      ).toBe(false);
      expect((await database.db.select().from(adminAudit)).length).toBe(3);
    });
  },
);
