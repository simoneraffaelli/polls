import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MEDSL_SENATE_V8, parseMedslSenateCsv } from "./senate";

const EXPECTED_ORIGINAL_BYTES = 530_501;
export const MEDSL_SENATE_V8_LOCAL_PATH = fileURLToPath(
  new URL(
    "../../../.tools/reference/medsl-senate-v8-original.csv",
    import.meta.url,
  ),
);

/** Reads only the pinned local CC0 original; never fetches network data. */
export function loadPinnedSenateV8(): ReturnType<typeof parseMedslSenateCsv> {
  const size = statSync(MEDSL_SENATE_V8_LOCAL_PATH).size;
  if (size !== EXPECTED_ORIGINAL_BYTES)
    throw new Error("MEDSL Senate V8 original byte length mismatch");
  const bytes = readFileSync(MEDSL_SENATE_V8_LOCAL_PATH);
  if (bytes.byteLength !== EXPECTED_ORIGINAL_BYTES)
    throw new Error("MEDSL Senate V8 original changed during read");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== MEDSL_SENATE_V8.originalFileSha256)
    throw new Error("MEDSL Senate V8 original checksum mismatch");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return parseMedslSenateCsv(text);
}
