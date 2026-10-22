import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  createIsolatedDatabase,
  seedDatabase,
  us2026,
  type IsolatedDatabase,
} from "./harness";

it("upgrades the phase 6 schema without deleting old links or pretending they existed earlier", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "polls-upgrade-test-"));
  let database: IsolatedDatabase | undefined;
  try {
    await mkdir(path.join(folder, "meta"));
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    ) as {
      entries: { idx: number; tag: string }[];
    };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 2);
    expect(journal.entries).toHaveLength(3);
    await writeFile(
      path.join(folder, "meta/_journal.json"),
      JSON.stringify(journal),
    );
    for (const entry of journal.entries) {
      await copyFile(
        path.join("drizzle", `${entry.tag}.sql`),
        path.join(folder, `${entry.tag}.sql`),
      );
    }
    database = await createIsolatedDatabase({ migrationsFolder: folder });
    const { sourceId } = await seedDatabase(database);
    const pollId = randomUUID();
    const linkId = randomUUID();
    await database.pool.query(
      "INSERT INTO poll_records (id, source_id, external_id) VALUES ($1, $2, $3)",
      [pollId, sourceId, "upgrade-preserved"],
    );
    await database.pool.query(
      "INSERT INTO poll_edition_links (id, poll_id, edition_id) VALUES ($1, $2, $3)",
      [linkId, pollId, us2026.editionId],
    );
    const before = await database.pool.query<{ now: Date }>(
      "SELECT clock_timestamp() AS now",
    );
    await database.upgrade();
    await database.upgrade();
    const links = await database.pool.query<{ id: string; created_at: Date }>(
      "SELECT id, created_at FROM poll_edition_links WHERE poll_id = $1",
      [pollId],
    );
    expect(links.rows).toHaveLength(1);
    expect(links.rows[0].id).toBe(linkId);
    expect(links.rows[0].created_at.getTime()).toBeGreaterThanOrEqual(
      before.rows[0].now.getTime(),
    );
    const retained = await database.pool.query(
      "SELECT external_id FROM poll_records WHERE id = $1",
      [pollId],
    );
    expect(retained.rows[0].external_id).toBe("upgrade-preserved");
    await expect(
      database.pool.query("SELECT 1 FROM structural_model_references LIMIT 1"),
    ).resolves.toBeDefined();
  } finally {
    await database?.cleanup();
    const resolved = path.resolve(folder);
    if (
      path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !path.basename(resolved).startsWith("polls-upgrade-test-")
    )
      throw new Error("Unsafe temporary migration folder");
    await rm(resolved, { recursive: true, force: true });
  }
}, 30_000);
