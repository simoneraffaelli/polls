import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  pollObservationSchema,
  type PollObservation,
} from "../../elections/polling/poll";
import {
  commitControlledImport,
  previewControlledImport,
  type ControlledImport,
} from "../../platform/collection/import-service";
import { CollectionError } from "../../platform/collection/errors";
import type { Database } from "../database/client";
import {
  beginManualImportRun,
  createPollCollectionPageStore,
} from "../database/collection-repository";
import {
  adminAudit,
  adminImportPreviews,
  collectionRuns,
  configuredSources,
  editions,
  races,
  sourceSectionBindings,
} from "../database/schema";

const requestSchema = z.object({
  sourceId: z.uuid(),
  sectionId: z.string().min(1).max(120),
  editionId: z.string().min(1).max(120),
  raceId: z.uuid().nullable(),
  format: z.enum(["json", "csv"]),
  content: z.string().min(1).max(1_000_000),
});
export const previewRequestSchema = requestSchema;
export const commitRequestSchema = requestSchema.extend({
  previewId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});

const limits = {
  maxBytes: 1_000_000,
  maxRows: 500,
  maxColumns: 40,
  maxCellChars: 50_000,
  maxReportedErrors: 20,
};
type ImportRequest = z.infer<typeof requestSchema>;

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function importInput(
  input: ImportRequest,
  run: ControlledImport<PollObservation>["run"],
): ControlledImport<PollObservation> {
  return {
    ...input,
    run,
    destinations: [
      {
        scope: { sectionId: input.sectionId, editionId: input.editionId },
        raceId: input.raceId,
      },
    ],
    limits,
    parserVersion: "manual-poll-import-v1",
    transformationVersion: "manual-poll-import-v1",
    schema: pollObservationSchema,
    normalize(raw) {
      if (input.format === "json") return raw;
      if (
        !raw ||
        typeof raw !== "object" ||
        !("record_json" in raw) ||
        typeof raw.record_json !== "string"
      )
        throw new Error("Invalid CSV record");
      return JSON.parse(raw.record_json) as unknown;
    },
  };
}

async function assertManualDestination(db: Database, input: ImportRequest) {
  const [source] = await db
    .select({
      providerId: configuredSources.providerId,
      enabled: configuredSources.enabled,
    })
    .from(configuredSources)
    .where(eq(configuredSources.id, input.sourceId));
  if (source?.providerId !== "provider:manual-import" || !source.enabled)
    throw new CollectionError(
      "source_disabled",
      "Manual import source is unavailable",
    );
  const [binding] = await db
    .select({ editionId: editions.id })
    .from(editions)
    .innerJoin(
      sourceSectionBindings,
      eq(sourceSectionBindings.sectionId, editions.sectionId),
    )
    .where(
      and(
        eq(editions.id, input.editionId),
        eq(editions.sectionId, input.sectionId),
        eq(sourceSectionBindings.sourceId, input.sourceId),
        eq(sourceSectionBindings.enabled, true),
      ),
    );
  if (!binding)
    throw new CollectionError(
      "source_disabled",
      "Manual import destination is unavailable",
    );
  if (input.raceId) {
    const [race] = await db
      .select({ id: races.id })
      .from(races)
      .where(
        and(eq(races.id, input.raceId), eq(races.editionId, input.editionId)),
      );
    if (!race)
      throw new CollectionError("schema", "Manual import race is unavailable");
  }
}

export async function previewAdminPollImport(
  db: Database,
  actorUserId: string,
  raw: unknown,
) {
  const input = previewRequestSchema.parse(raw);
  await assertManualDestination(db, input);
  const previewId = randomUUID();
  const preview = await previewControlledImport(
    importInput(input, {
      sourceId: input.sourceId,
      runId: previewId,
      cursorBefore: null,
      cursorGenerationBefore: 0,
    }),
  );
  if (preview.invalidRows > 0 || preview.validRows === 0)
    return { previewId: null, preview };
  await db.insert(adminImportPreviews).values({
    id: previewId,
    actorUserId,
    sourceId: input.sourceId,
    sectionId: input.sectionId,
    editionId: input.editionId,
    raceId: input.raceId,
    format: input.format,
    contentHash: contentHash(input.content),
    expiresAt: sql`clock_timestamp() + interval '15 minutes'`,
  });
  return { previewId, preview };
}

export async function commitAdminPollImport(
  db: Database,
  actorUserId: string,
  raw: unknown,
) {
  const input = commitRequestSchema.parse(raw);
  const [preview] = await db
    .select()
    .from(adminImportPreviews)
    .where(
      and(
        eq(adminImportPreviews.id, input.previewId),
        eq(adminImportPreviews.actorUserId, actorUserId),
      ),
    );
  if (
    !preview ||
    preview.sourceId !== input.sourceId ||
    preview.sectionId !== input.sectionId ||
    preview.editionId !== input.editionId ||
    preview.raceId !== input.raceId ||
    preview.format !== input.format ||
    preview.contentHash !== contentHash(input.content)
  )
    throw new CollectionError("schema", "Import preview is missing or changed");
  if (preview.consumedAt) {
    const [saved] = await db
      .select({
        status: collectionRuns.status,
        savedCount: collectionRuns.savedCount,
        quarantinedCount: collectionRuns.quarantinedCount,
      })
      .from(collectionRuns)
      .where(eq(collectionRuns.id, input.previewId));
    if (saved?.status !== "succeeded")
      throw new Error("Consumed import receipt is incomplete");
    return {
      runId: input.previewId,
      saved: saved.savedCount ?? 0,
      quarantinedCount: saved.quarantinedCount ?? 0,
      repeated: true,
    };
  }
  const [valid] = await db
    .select({ id: adminImportPreviews.id })
    .from(adminImportPreviews)
    .where(
      and(
        eq(adminImportPreviews.id, input.previewId),
        sql`${adminImportPreviews.expiresAt} > clock_timestamp()`,
      ),
    );
  if (!valid) throw new CollectionError("schema", "Import preview has expired");
  await assertManualDestination(db, input);
  const run = await beginManualImportRun(db, input.sourceId, input.previewId);
  const store = createPollCollectionPageStore(db, async (tx) => {
    const [consumed] = await tx
      .update(adminImportPreviews)
      .set({ consumedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(adminImportPreviews.id, input.previewId),
          eq(adminImportPreviews.actorUserId, actorUserId),
          isNull(adminImportPreviews.consumedAt),
          sql`${adminImportPreviews.expiresAt} > clock_timestamp()`,
        ),
      )
      .returning({ id: adminImportPreviews.id });
    if (!consumed) throw new Error("Import preview has already been consumed");
    await tx.insert(adminAudit).values({
      actorUserId,
      action: "poll_import.commit",
      targetType: "collection_run",
      targetId: run.runId,
      reason: input.reason,
    });
  });
  return commitControlledImport(importInput(input, run), store);
}
