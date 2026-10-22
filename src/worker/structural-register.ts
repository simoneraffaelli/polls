import { open } from "node:fs/promises";
import { createDatabase } from "../infrastructure/database/client";
import { registerStructuralReference } from "../infrastructure/database/structural-reference";
import { readWorkerConfig } from "../infrastructure/config/worker-env";

const maxBytes = 1_000_000;

async function main() {
  const filePath = process.env.STRUCTURAL_REFERENCE_FILE;
  const reviewerUserId = process.env.REVIEWER_USER_ID;
  if (!filePath || !reviewerUserId || process.argv.length !== 2)
    throw new Error("Structural registration environment is incomplete");
  const file = await open(filePath, "r");
  let bytes: Buffer;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxBytes)
      throw new Error("Structural reference exceeds file budget");
    bytes = Buffer.alloc(info.size);
    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== bytes.length)
      throw new Error("Structural reference changed while reading");
  } finally {
    await file.close();
  }
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Structural reference format is invalid");
  const { db, close } = createDatabase({
    connectionString: readWorkerConfig(process.env).databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  try {
    const result = await registerStructuralReference(db, {
      ...raw,
      reviewerUserId,
    });
    process.stdout.write(
      `Structural reference ${result.repeated ? "already present" : "registered"}: ${result.id}\n`,
    );
  } finally {
    await close();
  }
}

main().catch(() => {
  process.stderr.write(
    "Structural reference registration failed; verify file, reviewer, and database.\n",
  );
  process.exitCode = 1;
});
