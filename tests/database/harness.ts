import { randomBytes } from "node:crypto";
import pg from "pg";
import { createDatabase } from "../../src/infrastructure/database/client";
import { applyMigrations } from "../../src/infrastructure/database/migrate";
import {
  collectionRuns,
  configuredSources,
  countries,
  editions,
  providers,
  sections,
} from "../../src/infrastructure/database/schema";

/** No fallback to DATABASE_URL: these tests may create and remove only their own schemas. */
function requiredTestDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString)
    throw new Error("TEST_DATABASE_URL is required for database tests");
  let databaseName: string;
  try {
    const url = new URL(connectionString);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("Wrong protocol");
    }
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL");
  }
  if (!/(^|[_-])test([_-]|$)/i.test(databaseName)) {
    throw new Error("TEST_DATABASE_URL must name a test database");
  }
  return connectionString;
}

const schemaName = (prefix: string) =>
  `${prefix}_${randomBytes(8).toString("hex")}`;

export async function createIsolatedDatabase(
  options: { migrationsFolder?: string } = {},
) {
  const connectionString = requiredTestDatabaseUrl();
  const dataSchema = schemaName("polls_test_data");
  const migrationsSchema = schemaName("polls_test_migrations");
  const controlPool = new pg.Pool({ connectionString, max: 1 });
  try {
    await controlPool.query(`CREATE SCHEMA "${dataSchema}"`);
  } catch (error) {
    await controlPool.end();
    throw error;
  }
  const database = createDatabase({
    connectionString,
    options: `-c search_path=${dataSchema}`,
    max: 5,
  });
  try {
    const [{ search_path: searchPath }] = (
      await database.pool.query<{ search_path: string }>("SHOW search_path")
    ).rows;
    if (searchPath !== dataSchema)
      throw new Error("Database test search_path was not isolated");
    await applyMigrations(database.pool, { migrationsSchema, ...options });
    return {
      ...database,
      async upgrade() {
        await applyMigrations(database.pool, { migrationsSchema });
      },
      async cleanup() {
        await database.close();
        await controlPool.query(
          `DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`,
        );
        await controlPool.query(
          `DROP SCHEMA IF EXISTS "${dataSchema}" CASCADE`,
        );
        await controlPool.end();
      },
    };
  } catch (error) {
    await database.close();
    await controlPool.query(
      `DROP SCHEMA IF EXISTS "${migrationsSchema}" CASCADE`,
    );
    await controlPool.query(`DROP SCHEMA IF EXISTS "${dataSchema}" CASCADE`);
    await controlPool.end();
    throw error;
  }
}

export type IsolatedDatabase = Awaited<
  ReturnType<typeof createIsolatedDatabase>
>;

export async function seedDatabase(database: IsolatedDatabase) {
  const { db } = database;
  await db.insert(countries).values([
    { id: "country:us", code: "US", slug: "usa", name: "USA" },
    { id: "country:it", code: "IT", slug: "italy", name: "Italia" },
  ]);
  await db.insert(sections).values([
    {
      id: "section:us:midterms",
      countryId: "country:us",
      slug: "midterms",
      name: "Midterms",
    },
    {
      id: "section:it:midterms",
      countryId: "country:it",
      slug: "midterms",
      name: "Midterms Italia",
    },
  ]);
  await db.insert(editions).values([
    {
      id: "edition:us:midterms:2026",
      sectionId: "section:us:midterms",
      slug: "2026",
      name: "2026",
    },
    {
      id: "edition:us:midterms:2028",
      sectionId: "section:us:midterms",
      slug: "2028",
      name: "2028",
    },
    {
      id: "edition:it:midterms:2026",
      sectionId: "section:it:midterms",
      slug: "2026",
      name: "2026",
    },
  ]);
  await db
    .insert(providers)
    .values({ id: "provider:test-polls", family: "polls", name: "Test Polls" });
  const [source] = await db
    .insert(configuredSources)
    .values({
      providerId: "provider:test-polls",
      name: "Test source",
      enabled: true,
    })
    .returning({ id: configuredSources.id });
  const [collection] = await db
    .insert(collectionRuns)
    .values({ sourceId: source.id, status: "succeeded" })
    .returning({ id: collectionRuns.id });
  return { sourceId: source.id, ingestionRunId: collection.id };
}

export const us2026 = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
};
export const us2028 = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2028",
};
export const it2026 = {
  sectionId: "section:it:midterms",
  editionId: "edition:it:midterms:2026",
};

export function pollObservation(
  sourceId: string,
  ingestionRunId: string,
  externalId: string,
  content: "a" | "b",
  acquiredAt: string,
) {
  return {
    provenance: {
      sourceId,
      sourceUrl: `https://example.org/polls/${externalId}`,
      externalId,
      sourceRevision: content,
      observed: {
        kind: "date_period" as const,
        startDate: "2026-10-10",
        endDate: "2026-10-12",
      },
      declaredPublication: { kind: "date" as const, date: "2026-10-13" },
      acquiredAt,
      ingestionRunId,
      parserVersion: "test-parser-1",
      transformationVersion: "test-normalizer-1",
      contentHash: content.repeat(64),
    },
    pollster: "Test pollster",
    sponsors: ["Test sponsor"],
    questions: [
      {
        questionId: "generic-ballot",
        wording: null,
        kind: "generic_ballot" as const,
        population: {
          kind: "registered_voters" as const,
          description: "Registered voters",
        },
        sampleGroupId: "shared-study-sample",
        sampleSize: 1000,
        options: [
          {
            optionId: "option-a",
            label: "Option A",
            percentage: content === "a" ? 48 : 49,
          },
          {
            optionId: "option-b",
            label: "Option B",
            percentage: content === "a" ? 47 : 46,
          },
        ],
      },
    ],
  };
}
