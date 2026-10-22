import { open } from "node:fs/promises";
import { readWorkerConfig } from "../infrastructure/config/worker-env";
import { createDatabase } from "../infrastructure/database/client";
import { registerForecastQuestion } from "../infrastructure/database/forecast-question";

const maxBytes = 16_384;

async function main(): Promise<void> {
  const filePath = process.env.MODEL_QUESTION_FILE;
  if (!filePath || process.argv.length !== 2)
    throw new Error("Question registration file is required");
  const file = await open(filePath, "r");
  let bytes: Buffer;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxBytes)
      throw new Error("Question registration exceeds file budget");
    bytes = Buffer.alloc(info.size);
    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== bytes.length)
      throw new Error("Question registration changed while reading");
  } finally {
    await file.close();
  }
  const input: unknown = JSON.parse(bytes.toString("utf8"));
  const config = readWorkerConfig(process.env);
  const database = createDatabase({
    connectionString: config.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
  });
  try {
    const question = await registerForecastQuestion(database.db, input);
    process.stdout.write(
      `Question ${question.id} registered as ${question.state}.\n`,
    );
  } finally {
    await database.close();
  }
}

main().catch(() => {
  process.stderr.write(
    "Question registration failed; verify file, active administrator, and database.\n",
  );
  process.exitCode = 1;
});
