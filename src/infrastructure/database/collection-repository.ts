import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  pollObservationSchema,
  type PollObservation,
} from "../../elections/polling/poll";
import type {
  CollectionDestination,
  CollectionPageStore,
  CollectionRun,
  CollectionResult,
  SourcePage,
} from "../../platform/collection/contracts";
import { CollectionError } from "../../platform/collection/errors";
import {
  contentHashSchema,
  editionScopeSchema,
  internalIdSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { Database } from "./client";
import { recordPollRevisionInTransaction } from "./poll-repository";
import {
  collectionRuns,
  configuredSources,
  editions,
  quarantinedObservations,
  races,
  sourceCursors,
  sourceSectionBindings,
} from "./schema";

const uuidSchema = z.uuid();

function sameCursor(a: string | null, b: string | null): boolean {
  return a === b;
}

function pageHash(
  page: SourcePage<PollObservation>,
  destinations: readonly CollectionDestination[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({ page, destinations }))
    .digest("hex");
}

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

export function createPollCollectionPageStore(
  db: Database,
): CollectionPageStore<PollObservation> {
  return {
    async readCommittedPage(
      run: CollectionRun,
    ): Promise<CollectionResult | null> {
      const [saved] = await db
        .select()
        .from(collectionRuns)
        .where(eq(collectionRuns.id, uuidSchema.parse(run.runId)));
      if (
        !saved ||
        saved.sourceId !== run.sourceId ||
        !sameCursor(saved.cursorBefore, run.cursorBefore) ||
        saved.cursorGenerationBefore !== run.cursorGenerationBefore
      ) {
        throw new Error("Collection run snapshot mismatch");
      }
      if (saved.status === "failed")
        throw new CollectionError("schema", "Collection run has failed");
      if (saved.status !== "succeeded") return null;
      if (
        saved.hasMore === null ||
        saved.savedCount === null ||
        saved.quarantinedCount === null
      )
        throw new Error("Committed page receipt is incomplete");
      return {
        saved: saved.savedCount,
        quarantinedCount: saved.quarantinedCount,
        repeated: true,
        nextCursor: saved.cursorAfter,
        hasMore: saved.hasMore,
      };
    },

    async commitPage(input: {
      run: CollectionRun;
      page: SourcePage<PollObservation>;
      destinations: readonly CollectionDestination[];
    }): Promise<{
      saved: number;
      repeated: boolean;
      quarantinedCount: number;
    }> {
      const { run, page, destinations } = input;
      uuidSchema.parse(run.sourceId);
      uuidSchema.parse(run.runId);
      utcInstantSchema.parse(page.acquiredAt);
      if (!Array.isArray(destinations) || destinations.length === 0)
        throw new Error("Collection destinations required");
      if (!Array.isArray(page.quarantined))
        throw new Error("Quarantine metadata required");
      const parsedDestinations = destinations.map((destination) => ({
        scope: editionScopeSchema.parse(destination.scope),
        raceId:
          destination.raceId === null
            ? null
            : uuidSchema.parse(destination.raceId),
      }));
      const destinationMap = new Map(
        parsedDestinations.map((destination) => [
          JSON.stringify([destination.scope.editionId, destination.raceId]),
          destination,
        ]),
      );
      const checkedDestinations = [...destinationMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, destination]) => destination);
      const quarantined = page.quarantined.map((item) => ({
        externalId:
          item.externalId === null
            ? null
            : internalIdSchema.parse(item.externalId),
        contentHash: contentHashSchema.parse(item.contentHash),
        reasonCode: internalIdSchema.parse(item.reasonCode),
      }));
      const observations = page.observations.map((item) =>
        pollObservationSchema.parse(item),
      );
      const digest = pageHash(
        { ...page, observations, quarantined },
        checkedDestinations,
      );
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM collection_runs WHERE id = ${run.runId} FOR UPDATE`,
        );
        const [storedRun] = await tx
          .select()
          .from(collectionRuns)
          .where(eq(collectionRuns.id, run.runId));
        if (
          !storedRun ||
          storedRun.sourceId !== run.sourceId ||
          !sameCursor(storedRun.cursorBefore, run.cursorBefore) ||
          storedRun.cursorGenerationBefore !== run.cursorGenerationBefore
        ) {
          throw new Error("Collection run snapshot mismatch");
        }
        if (storedRun.status === "succeeded") {
          if (storedRun.pageHash !== digest)
            throw new Error("Conflicting replay of committed collection page");
          return {
            saved: storedRun.savedCount ?? 0,
            quarantinedCount: storedRun.quarantinedCount ?? 0,
            repeated: true,
          };
        }
        if (storedRun.status !== "running")
          throw new CollectionError("schema", "Collection run is not active");

        await tx.execute(
          sql`SELECT id FROM configured_sources WHERE id = ${run.sourceId} FOR SHARE`,
        );
        const [source] = await tx
          .select({ enabled: configuredSources.enabled })
          .from(configuredSources)
          .where(eq(configuredSources.id, run.sourceId));
        if (!source?.enabled)
          throw new CollectionError(
            "source_disabled",
            "Configured source is disabled",
          );
        await tx.execute(
          sql`SELECT source_id FROM source_cursors WHERE source_id = ${run.sourceId} FOR UPDATE`,
        );
        const [cursor] = await tx
          .select()
          .from(sourceCursors)
          .where(eq(sourceCursors.sourceId, run.sourceId));
        if (
          !cursor ||
          cursor.generation !== run.cursorGenerationBefore ||
          !sameCursor(cursor.cursor, run.cursorBefore)
        ) {
          throw new CollectionError(
            "cursor_conflict",
            "Stale collection run cannot advance source cursor",
          );
        }

        for (const destination of checkedDestinations) {
          await tx.execute(
            sql`SELECT id FROM editions WHERE id = ${destination.scope.editionId} FOR SHARE`,
          );
          await tx.execute(
            sql`SELECT source_id FROM source_section_bindings WHERE source_id = ${run.sourceId} AND section_id = ${destination.scope.sectionId} FOR SHARE`,
          );
          const [binding] = await tx
            .select({ editionId: editions.id })
            .from(editions)
            .innerJoin(
              sourceSectionBindings,
              eq(sourceSectionBindings.sectionId, editions.sectionId),
            )
            .where(
              and(
                eq(editions.id, destination.scope.editionId),
                eq(editions.sectionId, destination.scope.sectionId),
                eq(sourceSectionBindings.sourceId, run.sourceId),
                eq(sourceSectionBindings.enabled, true),
              ),
            );
          if (!binding)
            throw new Error("Source is not enabled for destination section");
          if (destination.raceId !== null) {
            await tx.execute(
              sql`SELECT id FROM races WHERE id = ${destination.raceId} FOR SHARE`,
            );
            const [race] = await tx
              .select({ id: races.id })
              .from(races)
              .where(
                and(
                  eq(races.id, destination.raceId),
                  eq(races.editionId, destination.scope.editionId),
                ),
              );
            if (!race)
              throw new Error("Race does not belong to destination edition");
          }
        }
        for (const observation of observations) {
          if (
            observation.provenance.sourceId !== run.sourceId ||
            observation.provenance.ingestionRunId !== run.runId ||
            Date.parse(observation.provenance.acquiredAt) !==
              Date.parse(page.acquiredAt)
          ) {
            throw new Error(
              "Observation provenance does not match fetched page",
            );
          }
          for (const destination of checkedDestinations) {
            await recordPollRevisionInTransaction(tx, observation, destination);
          }
        }
        if (quarantined.length > 0)
          await tx.insert(quarantinedObservations).values(
            quarantined.map((item) => ({
              runId: run.runId,
              sourceId: run.sourceId,
              acquiredAt: new Date(page.acquiredAt),
              ...item,
            })),
          );

        const [advanced] = await tx
          .update(sourceCursors)
          .set({
            cursor: page.nextCursor,
            generation: cursor.generation + 1,
            lastRunId: run.runId,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(sourceCursors.sourceId, run.sourceId),
              eq(sourceCursors.generation, run.cursorGenerationBefore),
              run.cursorBefore === null
                ? isNull(sourceCursors.cursor)
                : eq(sourceCursors.cursor, run.cursorBefore),
            ),
          )
          .returning({ generation: sourceCursors.generation });
        if (!advanced)
          throw new CollectionError(
            "cursor_conflict",
            "Stale collection run cannot advance source cursor",
          );
        await tx
          .update(collectionRuns)
          .set({
            status: "succeeded",
            cursorAfter: page.nextCursor,
            hasMore: page.hasMore,
            pageHash: digest,
            pageAcquiredAt: new Date(page.acquiredAt),
            savedCount: observations.length,
            quarantinedCount: quarantined.length,
            completedAt: sql`clock_timestamp()`,
            errorCode: null,
            retryNotBefore: null,
          })
          .where(eq(collectionRuns.id, run.runId));
        return {
          saved: observations.length,
          quarantinedCount: quarantined.length,
          repeated: false,
        };
      });
    },
  };
}
