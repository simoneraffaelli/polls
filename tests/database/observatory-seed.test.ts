import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedObservatoryStructure,
  SOURCE_SEEDS,
  sourceIdFor,
  stableCatalogUuid,
} from "../../src/composition/sources";
import {
  configuredSources,
  countries,
  editions,
  races,
  sourceSectionBindings,
} from "../../src/infrastructure/database/schema";
import { createIsolatedDatabase, type IsolatedDatabase } from "./harness";

describe("observatory structural seed", () => {
  let database: IsolatedDatabase;
  beforeAll(async () => {
    database = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await database?.cleanup();
  });

  it("is deterministic, idempotent and leaves all sources disabled", async () => {
    const first = await seedObservatoryStructure(database.db);
    const second = await seedObservatoryStructure(database.db);
    expect(first).toEqual(second);
    expect(first.raceCount).toBe(470);
    expect(first.sourceIds).toHaveLength(4);
    expect(stableCatalogUuid("race:us:midterms:2026:house:ak-al")).toBe(
      stableCatalogUuid("race:us:midterms:2026:house:ak-al"),
    );
    expect(
      (await database.db.select().from(countries))
        .map((row) => row.code)
        .sort(),
    ).toEqual(["IT", "US"]);
    expect(await database.db.select().from(editions)).toHaveLength(1);
    expect(await database.db.select().from(races)).toHaveLength(470);
    const sources = await database.db.select().from(configuredSources);
    expect(sources).toHaveLength(4);
    expect(sources.every((source) => !source.enabled)).toBe(true);
    expect(await database.db.select().from(sourceSectionBindings)).toHaveLength(
      3,
    );
    expect(
      (await database.db.select().from(sourceSectionBindings)).every(
        (binding) => !binding.enabled,
      ),
    ).toBe(true);
    const [market] = await database.db
      .select()
      .from(configuredSources)
      .where(eq(configuredSources.id, sourceIdFor(SOURCE_SEEDS[2].key)));
    expect(market?.enabled).toBe(false);
    const manualId = sourceIdFor("source:manual-import:polls");
    await database.db
      .update(configuredSources)
      .set({ enabled: true })
      .where(eq(configuredSources.id, manualId));
    await database.db
      .update(sourceSectionBindings)
      .set({ enabled: true })
      .where(eq(sourceSectionBindings.sourceId, manualId));
    await seedObservatoryStructure(database.db);
    const [manual] = await database.db
      .select()
      .from(configuredSources)
      .where(eq(configuredSources.id, manualId));
    const [binding] = await database.db
      .select()
      .from(sourceSectionBindings)
      .where(eq(sourceSectionBindings.sourceId, manualId));
    expect(manual?.enabled).toBe(true);
    expect(binding?.enabled).toBe(true);
  });
});
