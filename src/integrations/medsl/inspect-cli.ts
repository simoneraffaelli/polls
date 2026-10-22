import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MEDSL_SENATE_V8, parseMedslSenateCsv } from "./senate";

/** Local validation only. Reads the pinned CC0 original; never imports to the DB. */
function main(): void {
  const inputPath = fileURLToPath(
    new URL(
      "../../../.tools/reference/medsl-senate-v8-original.csv",
      import.meta.url,
    ),
  );
  const outputPath = fileURLToPath(
    new URL(
      "../../../.tools/reference/medsl-senate-v8-report.json",
      import.meta.url,
    ),
  );
  const bytes = readFileSync(inputPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== MEDSL_SENATE_V8.originalFileSha256)
    throw new Error("MEDSL Senate V8 original checksum mismatch");
  const results = parseMedslSenateCsv(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  const ohio = results.find(
    (result) =>
      result.year === 2024 &&
      result.stateCode === "OH" &&
      result.stage === "general" &&
      !result.special,
  );
  const officialOhioMatch =
    ohio?.totalVotes === 5_704_620 &&
    ohio.candidates.find((candidate) => candidate.name === "BERNIE MORENO")
      ?.votes === 2_857_383 &&
    ohio.candidates.find((candidate) => candidate.name === "SHERROD BROWN")
      ?.votes === 2_650_949;
  if (!ohio || !officialOhioMatch)
    throw new Error(
      "MEDSL Ohio 2024 totals differ from the Clerk's official statistics",
    );
  const marginCounts: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};
  for (const result of results) {
    const marginKey =
      result.margin.status === "eligible" ? "eligible" : result.margin.reason;
    marginCounts[marginKey] = (marginCounts[marginKey] ?? 0) + 1;
    stageCounts[result.stage] = (stageCounts[result.stage] ?? 0) + 1;
  }
  const report = {
    source: MEDSL_SENATE_V8,
    byteLength: bytes.byteLength,
    sha256,
    contestCount: results.length,
    yearRange: [
      Math.min(...results.map((result) => result.year)),
      Math.max(...results.map((result) => result.year)),
    ],
    stageCounts,
    marginCounts,
    officialOhio2024Check: {
      sourceUrl:
        "https://clerk.house.gov/member_info/electionInfo/2024/statistics2024.pdf",
      matched: true,
      totalVotes: ohio.totalVotes,
      morenoVotes: 2_857_383,
      brownVotes: 2_650_949,
    },
    databaseImported: false,
  };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
}

main();
