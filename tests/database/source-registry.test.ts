import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createIsolatedDatabase, type IsolatedDatabase } from "./harness";
import { seedObservatoryStructure } from "../../src/composition/sources";
import {
  COLLECTIBLE_SOURCE_IDS,
  readCollectionSourceRegistry,
} from "../../src/composition/source-registry";
import {
  configuredSources,
  sourceSectionBindings,
} from "../../src/infrastructure/database/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "worker source registration",
  () => {
    let database: IsolatedDatabase;
    beforeAll(async () => {
      database = await createIsolatedDatabase();
      await seedObservatoryStructure(database.db);
    });
    afterAll(async () => {
      await database?.cleanup();
    });

    it("registers only enabled, bound, fixed providers without opening HTTP", async () => {
      expect((await readCollectionSourceRegistry(database.db)).size).toBe(0);
      await database.db
        .update(configuredSources)
        .set({ enabled: true })
        .where(eq(configuredSources.id, COLLECTIBLE_SOURCE_IDS.votehub));
      expect((await readCollectionSourceRegistry(database.db)).size).toBe(0);
      await database.db
        .update(sourceSectionBindings)
        .set({ enabled: true })
        .where(
          eq(sourceSectionBindings.sourceId, COLLECTIBLE_SOURCE_IDS.votehub),
        );
      const withPolls = await readCollectionSourceRegistry(database.db);
      expect(withPolls.get(COLLECTIBLE_SOURCE_IDS.votehub)?.family).toBe(
        "polls",
      );
      await database.db
        .update(configuredSources)
        .set({ enabled: true })
        .where(eq(configuredSources.id, COLLECTIBLE_SOURCE_IDS.fed));
      await database.db
        .update(sourceSectionBindings)
        .set({ enabled: true })
        .where(eq(sourceSectionBindings.sourceId, COLLECTIBLE_SOURCE_IDS.fed));
      const both = await readCollectionSourceRegistry(database.db);
      expect(both.get(COLLECTIBLE_SOURCE_IDS.fed)?.family).toBe("articles");
      expect(both.size).toBe(2);
      await database.db
        .update(configuredSources)
        .set({ enabled: false })
        .where(eq(configuredSources.id, COLLECTIBLE_SOURCE_IDS.votehub));
      expect(
        (await readCollectionSourceRegistry(database.db)).has(
          COLLECTIBLE_SOURCE_IDS.votehub,
        ),
      ).toBe(false);
    });
  },
);
