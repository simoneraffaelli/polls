import { open } from "node:fs/promises";
import { createDatabase } from "../infrastructure/database/client";
import { registerPollOptionMapping } from "../infrastructure/database/option-mapping";
import { readWorkerConfig } from "../infrastructure/config/worker-env";

async function main() {
  const filePath = process.env.POLL_OPTION_MAPPING_FILE;
  const reviewerUserId = process.env.REVIEWER_USER_ID;
  if (!filePath || !reviewerUserId || process.argv.length !== 2)
    throw new Error("Option mapping registration environment is incomplete");
  const file = await open(filePath, "r");
  let bytes: Buffer;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > 65_536)
      throw new Error("Option mapping exceeds file budget");
    bytes = Buffer.alloc(info.size);
    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== bytes.length)
      throw new Error("Option mapping changed while reading");
  } finally {
    await file.close();
  }
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Option mapping format is invalid");
  const database = createDatabase({
    connectionString: readWorkerConfig(process.env).databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  try {
    const result = await registerPollOptionMapping(database.db, {
      ...raw,
      reviewerUserId,
    });
    process.stdout.write(
      `Option mapping ${result.repeated ? "already present" : "registered"}: ${result.id}\n`,
    );
  } finally {
    await database.close();
  }
}

main().catch(() => {
  process.stderr.write(
    "Option mapping registration failed; verify file, reviewer, and database.\n",
  );
  process.exitCode = 1;
});
