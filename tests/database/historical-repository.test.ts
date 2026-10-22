import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareSenateResults } from "../../src/integrations/medsl/prepared-import";
import {
  MEDSL_SENATE_V8,
  parseMedslSenateCsv,
} from "../../src/integrations/medsl/senate";
import {
  importHistoricalResults,
  readHistoricalResult,
} from "../../src/infrastructure/database/historical-repository";
import { historicalResultRevisions } from "../../src/infrastructure/database/schema";
import { createIsolatedDatabase, type IsolatedDatabase } from "./harness";

const sample = readFileSync(
  fileURLToPath(
    new URL(
      "../fixtures/providers/medsl-senate-v8-sample.csv",
      import.meta.url,
    ),
  ),
  "utf8",
);
const prepared = prepareSenateResults(parseMedslSenateCsv(sample));

describe("versioned MEDSL historical results", () => {
  let database: IsolatedDatabase;
  beforeAll(async () => {
    database = await createIsolatedDatabase();
  }, 30_000);
  afterAll(async () => {
    await database?.cleanup();
  }, 30_000);

  it("appends revisions, replays idempotently and enforces as-of availability", async () => {
    const first = {
      doi: MEDSL_SENATE_V8.doi,
      version: MEDSL_SENATE_V8.version,
      fileSha256: createHash("sha256").update(sample).digest("hex"),
      parserVersion: "medsl-senate-v8-fixture-parser-v1",
      availableAt: MEDSL_SENATE_V8.availableAt,
      acquiredAt: "2026-10-22T12:00:00.000Z",
    };
    expect(await importHistoricalResults(database.db, first, prepared)).toEqual(
      { inserted: 5, unchanged: 0 },
    );
    expect(await importHistoricalResults(database.db, first, prepared)).toEqual(
      { inserted: 0, unchanged: 5 },
    );
    const contestKey = "medsl:senate:2024:OH:general:regular";
    expect(
      await readHistoricalResult(database.db, {
        doi: first.doi,
        contestKey,
        asOf: "2024-11-05T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      await readHistoricalResult(database.db, {
        doi: first.doi,
        contestKey,
        asOf: "2026-05-12T00:00:00.000Z",
      }),
    ).toBeNull();
    const visible = await readHistoricalResult(database.db, {
      doi: first.doi,
      contestKey,
      asOf: first.acquiredAt,
    });
    expect(visible?.revision).toMatchObject({
      revisionNo: 1,
      totalVotes: 5_704_620,
      marginStatus: "eligible",
    });
    const second = {
      ...first,
      parserVersion: "medsl-senate-v8-fixture-parser-v2",
      acquiredAt: "2026-10-23T12:00:00.000Z",
    };
    expect(
      await importHistoricalResults(database.db, second, prepared),
    ).toEqual({ inserted: 5, unchanged: 0 });
    expect(
      (
        await readHistoricalResult(database.db, {
          doi: first.doi,
          contestKey,
          asOf: first.acquiredAt,
        })
      )?.revision.revisionNo,
    ).toBe(1);
    const latest = await readHistoricalResult(database.db, {
      doi: first.doi,
      contestKey,
      asOf: second.acquiredAt,
    });
    expect(latest?.revision).toMatchObject({
      revisionNo: 2,
      supersedesRevisionId: visible?.revision.id,
    });
    expect(
      await database.db.select().from(historicalResultRevisions),
    ).toHaveLength(10);
    await expect(
      importHistoricalResults(
        database.db,
        {
          ...first,
          parserVersion: "medsl-senate-v8-fixture-parser-v3",
          acquiredAt: "2026-10-21T12:00:00.000Z",
        },
        prepared,
      ),
    ).rejects.toThrow("go backwards");
    expect(
      await database.db.select().from(historicalResultRevisions),
    ).toHaveLength(10);
  });
});
