import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { CollectionRun } from "../../platform/collection/contracts";
import { CollectionError } from "../../platform/collection/errors";
import type { Database } from "./client";
import { collectionRuns, configuredSources, sourceCursors } from "./schema";

const uuidSchema = z.uuid();

/** Run identity and cursor snapshot are stored before enqueueing; no observation time is assigned yet. */
export const MAX_PAGES_PER_CYCLE = 20;
export const MAX_CYCLE_MS = 120_000;
export async function beginCollectionRun(
  db: Database,
  sourceId: unknown,
  continuationRunId?: string,
): Promise<CollectionRun> {
  const id = uuidSchema.parse(sourceId);
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({ enabled: configuredSources.enabled })
      .from(configuredSources)
      .where(eq(configuredSources.id, id));
    if (!source?.enabled)
      throw new CollectionError(
        "source_disabled",
        "Configured source is unavailable",
      );
    await tx
      .insert(sourceCursors)
      .values({ sourceId: id })
      .onConflictDoNothing();
    await tx.execute(
      sql`SELECT source_id FROM source_cursors WHERE source_id = ${id} FOR UPDATE`,
    );
    const [cursor] = await tx
      .select()
      .from(sourceCursors)
      .where(eq(sourceCursors.sourceId, id));
    if (!cursor) throw new Error("Source cursor could not be loaded");
    const [existing] = await tx
      .select()
      .from(collectionRuns)
      .where(
        and(
          eq(collectionRuns.sourceId, id),
          eq(collectionRuns.status, "running"),
          eq(collectionRuns.cursorGenerationBefore, cursor.generation),
        ),
      )
      .limit(1);
    if (existing)
      return {
        sourceId: id,
        runId: existing.id,
        cursorBefore: existing.cursorBefore,
        cursorGenerationBefore: existing.cursorGenerationBefore,
      };
    let continuation: typeof collectionRuns.$inferSelect | undefined;
    if (continuationRunId) {
      const [prior] = await tx
        .select()
        .from(collectionRuns)
        .where(eq(collectionRuns.id, uuidSchema.parse(continuationRunId)));
      if (
        !prior ||
        prior.sourceId !== id ||
        prior.status !== "succeeded" ||
        !prior.hasMore ||
        cursor.lastRunId !== prior.id ||
        prior.cursorAfter !== cursor.cursor
      ) {
        throw new CollectionError(
          "cursor_conflict",
          "Collection continuation is stale",
        );
      }
      if (
        prior.pageIndex + 1 >= MAX_PAGES_PER_CYCLE ||
        Date.now() - prior.cycleStartedAt.getTime() >= MAX_CYCLE_MS
      ) {
        throw new CollectionError("budget", "Collection cycle limit reached");
      }
      continuation = prior;
    }
    const newRunId = randomUUID();
    const [run] = await tx
      .insert(collectionRuns)
      .values({
        id: newRunId,
        sourceId: id,
        status: "running",
        queueJobId: newRunId,
        cursorBefore: cursor.cursor,
        cursorGenerationBefore: cursor.generation,
        ...(continuation
          ? {
              cycleId: continuation.cycleId,
              cycleStartedAt: continuation.cycleStartedAt,
              pageIndex: continuation.pageIndex + 1,
            }
          : {}),
      })
      .returning({ id: collectionRuns.id });
    if (!run) throw new Error("Collection run could not be created");
    return {
      sourceId: id,
      runId: run.id,
      cursorBefore: cursor.cursor,
      cursorGenerationBefore: cursor.generation,
    };
  });
}

/** A reviewed local import uses a durable run but never enqueues an HTTP job. */
export async function beginManualImportRun(
  db: Database,
  sourceId: string,
  runId: string,
): Promise<CollectionRun> {
  const source = uuidSchema.parse(sourceId);
  const id = uuidSchema.parse(runId);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM configured_sources WHERE id = ${source} FOR SHARE`,
    );
    const [configured] = await tx
      .select({
        enabled: configuredSources.enabled,
        providerId: configuredSources.providerId,
      })
      .from(configuredSources)
      .where(eq(configuredSources.id, source));
    if (
      !configured?.enabled ||
      configured.providerId !== "provider:manual-import"
    )
      throw new CollectionError(
        "source_disabled",
        "Manual import source is unavailable",
      );
    await tx
      .insert(sourceCursors)
      .values({ sourceId: source })
      .onConflictDoNothing();
    await tx.execute(
      sql`SELECT source_id FROM source_cursors WHERE source_id = ${source} FOR UPDATE`,
    );
    const [existing] = await tx
      .select()
      .from(collectionRuns)
      .where(eq(collectionRuns.id, id));
    if (existing) {
      if (existing.sourceId !== source || existing.status === "failed")
        throw new CollectionError("schema", "Manual import run is invalid");
      return {
        sourceId: source,
        runId: id,
        cursorBefore: existing.cursorBefore,
        cursorGenerationBefore: existing.cursorGenerationBefore,
      };
    }
    const [cursor] = await tx
      .select()
      .from(sourceCursors)
      .where(eq(sourceCursors.sourceId, source));
    if (!cursor) throw new Error("Manual import cursor unavailable");
    await tx.insert(collectionRuns).values({
      id,
      sourceId: source,
      status: "running",
      cursorBefore: cursor.cursor,
      cursorGenerationBefore: cursor.generation,
    });
    return {
      sourceId: source,
      runId: id,
      cursorBefore: cursor.cursor,
      cursorGenerationBefore: cursor.generation,
    };
  });
}

export async function loadCollectionRun(
  db: Database,
  runId: unknown,
): Promise<CollectionRun> {
  const id = uuidSchema.parse(runId);
  const [run] = await db
    .select()
    .from(collectionRuns)
    .where(eq(collectionRuns.id, id));
  if (!run) throw new Error("Unknown collection run");
  return {
    sourceId: run.sourceId,
    runId: run.id,
    cursorBefore: run.cursorBefore,
    cursorGenerationBefore: run.cursorGenerationBefore,
  };
}

/** Skip HTTP entirely when a queued source was disabled after enqueue. */
export async function assertCollectionSourceEnabled(
  db: Database,
  sourceId: string,
): Promise<void> {
  const [source] = await db
    .select({ enabled: configuredSources.enabled })
    .from(configuredSources)
    .where(eq(configuredSources.id, uuidSchema.parse(sourceId)));
  if (!source?.enabled)
    throw new CollectionError(
      "source_disabled",
      "Configured source is unavailable",
    );
  const [cursor] = await db
    .select({
      blockedReasonCode: sourceCursors.blockedReasonCode,
      remainingMs: sql<string>`GREATEST(0, EXTRACT(EPOCH FROM (${sourceCursors.notBefore} - clock_timestamp())) * 1000)`,
    })
    .from(sourceCursors)
    .where(eq(sourceCursors.sourceId, sourceId));
  if (cursor?.blockedReasonCode)
    throw new CollectionError(
      "rate_limited",
      "Source is blocked pending review",
    );
  const remainingMs = Number(cursor?.remainingMs ?? 0);
  if (remainingMs > 0)
    throw new CollectionError("rate_limited", "Source cooldown is active", {
      retryable: true,
      retryAfterMs: Math.ceil(remainingMs),
    });
}

export { createPollCollectionPageStore } from "./poll-collection-page-store";
