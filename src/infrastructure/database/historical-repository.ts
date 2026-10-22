import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  prepareSenateResults,
  type PreparedSenateResult,
} from "../../integrations/medsl/prepared-import";
import type { Database } from "./client";
import { historicalResultRecords, historicalResultRevisions } from "./schema";

const receiptSchema = z.object({
  doi: z.string().min(1),
  version: z.string().min(1),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.string().min(1),
  availableAt: z.iso.datetime({ offset: true }),
  acquiredAt: z.iso.datetime({ offset: true }),
});

export type HistoricalImportReceipt = z.infer<typeof receiptSchema>;

/** A verified local file is the only input; every changed receipt appends a revision. */
export async function importHistoricalResults(
  db: Database,
  receiptInput: HistoricalImportReceipt,
  prepared: readonly PreparedSenateResult[],
): Promise<{ inserted: number; unchanged: number }> {
  const receipt = receiptSchema.parse(receiptInput);
  const availableAt = new Date(receipt.availableAt);
  const acquiredAt = new Date(receipt.acquiredAt);
  if (availableAt > acquiredAt)
    throw new Error("Historical result cannot precede dataset availability");
  if (
    new Set(prepared.map((item) => item.result.contestKey)).size !==
    prepared.length
  )
    throw new Error("Duplicate historical contest key in import");
  if (
    prepared.some(
      (item) =>
        item.result.provenance.doi !== receipt.doi ||
        item.result.provenance.version !== receipt.version,
    )
  )
    throw new Error(
      "Historical dataset identity does not match parsed results",
    );
  const verified = prepareSenateResults(prepared.map((item) => item.result));
  if (
    prepared.some(
      (item, index) => item.contentHash !== verified[index]?.contentHash,
    )
  )
    throw new Error("Historical prepared content hash mismatch");
  let inserted = 0;
  let unchanged = 0;
  // A single transaction avoids leaving a partially updated dataset on validation failure.
  await db.transaction(async (tx) => {
    for (const item of prepared) {
      const result = item.result;
      await tx
        .insert(historicalResultRecords)
        .values({
          datasetDoi: receipt.doi,
          contestKey: result.contestKey,
        })
        .onConflictDoNothing();
      const [record] = await tx
        .select({ id: historicalResultRecords.id })
        .from(historicalResultRecords)
        .where(
          and(
            eq(historicalResultRecords.datasetDoi, receipt.doi),
            eq(historicalResultRecords.contestKey, result.contestKey),
          ),
        )
        .limit(1);
      if (!record) throw new Error("Historical result identity missing");
      await tx.execute(
        sql`SELECT id FROM historical_result_records WHERE id = ${record.id} FOR UPDATE`,
      );
      const [sameReceipt] = await tx
        .select({ id: historicalResultRevisions.id })
        .from(historicalResultRevisions)
        .where(
          and(
            eq(historicalResultRevisions.recordId, record.id),
            eq(historicalResultRevisions.datasetVersion, receipt.version),
            eq(historicalResultRevisions.fileSha256, receipt.fileSha256),
            eq(historicalResultRevisions.contentHash, item.contentHash),
            eq(historicalResultRevisions.parserVersion, receipt.parserVersion),
          ),
        )
        .limit(1);
      if (sameReceipt) {
        unchanged++;
        continue;
      }
      const [previous] = await tx
        .select({
          id: historicalResultRevisions.id,
          revisionNo: historicalResultRevisions.revisionNo,
          acquiredAt: historicalResultRevisions.acquiredAt,
        })
        .from(historicalResultRevisions)
        .where(eq(historicalResultRevisions.recordId, record.id))
        .orderBy(desc(historicalResultRevisions.revisionNo))
        .limit(1);
      if (previous && acquiredAt < previous.acquiredAt)
        throw new Error("Historical revision acquisition cannot go backwards");
      await tx.insert(historicalResultRevisions).values({
        recordId: record.id,
        revisionNo: (previous?.revisionNo ?? 0) + 1,
        supersedesRevisionId: previous?.id ?? null,
        datasetVersion: receipt.version,
        fileSha256: receipt.fileSha256,
        contentHash: item.contentHash,
        parserVersion: receipt.parserVersion,
        availableAt,
        acquiredAt,
        year: result.year,
        stateCode: result.stateCode,
        stage: result.stage,
        special: result.special,
        totalVotes: result.totalVotes,
        unattributedVotes: result.unattributedVotes,
        candidates: result.candidates,
        marginStatus: result.margin.status,
        leadingCandidate:
          result.margin.status === "eligible"
            ? result.margin.leadingCandidate
            : null,
        marginVotes:
          result.margin.status === "eligible" ? result.margin.votes : null,
        marginShare:
          result.margin.status === "eligible"
            ? String(result.margin.share)
            : null,
        exclusionReason:
          result.margin.status === "excluded" ? result.margin.reason : null,
        sourceVersions: result.sourceVersions,
      });
      inserted++;
    }
  });
  return { inserted, unchanged };
}

/** A historical value is visible only after both its source release and acquisition. */
export async function readHistoricalResult(
  db: Database,
  input: { doi: string; contestKey: string; asOf: string },
) {
  const parsed = z
    .object({
      doi: z.string().min(1),
      contestKey: z.string().min(1),
      asOf: z.iso.datetime({ offset: true }),
    })
    .parse(input);
  const [row] = await db
    .select({
      record: historicalResultRecords,
      revision: historicalResultRevisions,
    })
    .from(historicalResultRecords)
    .innerJoin(
      historicalResultRevisions,
      eq(historicalResultRevisions.recordId, historicalResultRecords.id),
    )
    .where(
      and(
        eq(historicalResultRecords.datasetDoi, parsed.doi),
        eq(historicalResultRecords.contestKey, parsed.contestKey),
        sql`${historicalResultRevisions.availableAt} <= ${new Date(parsed.asOf)}`,
        sql`${historicalResultRevisions.acquiredAt} <= ${new Date(parsed.asOf)}`,
      ),
    )
    .orderBy(desc(historicalResultRevisions.revisionNo))
    .limit(1);
  return row ?? null;
}
