import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  articleObservationSchema,
  type ArticleObservation,
} from "../../platform/data/article";
import type {
  CollectionDestination,
  CollectionPageStore,
  CollectionResult,
  CollectionRun,
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
import {
  articleEditionLinks,
  articleRevisions,
  articles,
  collectionRuns,
  configuredSources,
  editions,
  quarantinedObservations,
  sourceCursors,
  sourceSectionBindings,
} from "./schema";

const uuidSchema = z.uuid();
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

function pageHash(
  page: SourcePage<ArticleObservation>,
  destinations: readonly CollectionDestination[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({ page, destinations }))
    .digest("hex");
}

function articleFingerprintMatches(
  latest: typeof articleRevisions.$inferSelect,
  article: ArticleObservation,
) {
  return (
    latest.contentHash === article.provenance.contentHash &&
    latest.sourceRevision === article.provenance.sourceRevision &&
    latest.sourceUrl === article.provenance.sourceUrl &&
    latest.parserVersion === article.provenance.parserVersion &&
    latest.transformVersion === article.provenance.transformationVersion
  );
}

function articleRevisionValues(
  article: ArticleObservation,
  record: typeof articles.$inferSelect,
  latest: typeof articleRevisions.$inferSelect | undefined,
  acquiredAt: Date,
) {
  const observed = article.provenance.observed;
  const published = article.provenance.declaredPublication;
  return {
    articleId: record.id,
    sourceId: article.provenance.sourceId,
    revisionNo: (latest?.revisionNo ?? 0) + 1,
    supersedesRevisionId: latest?.id ?? null,
    sourceRevision: article.provenance.sourceRevision,
    contentHash: article.provenance.contentHash,
    sourceUrl: article.provenance.sourceUrl,
    publisher: article.publisher,
    title: article.title,
    excerpt: article.excerpt,
    excerptReusePermitted: article.excerptReusePermitted,
    observedKind: observed.kind,
    observedDate: observed.kind === "date" ? observed.date : null,
    observedStartDate:
      observed.kind === "date_period" ? observed.startDate : null,
    observedEndDate: observed.kind === "date_period" ? observed.endDate : null,
    observedAt: observed.kind === "instant" ? new Date(observed.at) : null,
    declaredPublicationKind: published?.kind ?? null,
    declaredPublicationDate: published?.kind === "date" ? published.date : null,
    declaredPublicationAt:
      published?.kind === "instant" ? new Date(published.at) : null,
    acquiredAt,
    parserVersion: article.provenance.parserVersion,
    transformVersion: article.provenance.transformationVersion,
    ingestionRunId: article.provenance.ingestionRunId,
  };
}

async function recordArticleRevision(
  tx: DatabaseTransaction,
  observation: ArticleObservation,
  editionId: string,
): Promise<boolean> {
  const article = articleObservationSchema.parse(observation);
  await tx
    .insert(articles)
    .values({
      sourceId: article.provenance.sourceId,
      externalId: article.provenance.externalId,
      canonicalUrl: article.url,
    })
    .onConflictDoNothing();
  const [record] = await tx
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.sourceId, article.provenance.sourceId),
        eq(articles.externalId, article.provenance.externalId),
      ),
    );
  if (!record) throw new Error("Article record could not be loaded");
  await tx.execute(
    sql`SELECT id FROM articles WHERE id = ${record.id} FOR UPDATE`,
  );
  if (record.canonicalUrl !== article.url)
    throw new CollectionError(
      "schema",
      "Article URL changed for stable external ID",
    );
  const [latest] = await tx
    .select()
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, record.id))
    .orderBy(desc(articleRevisions.revisionNo))
    .limit(1);
  const sameFingerprint = latest
    ? articleFingerprintMatches(latest, article)
    : false;
  const acquiredAt = new Date(article.provenance.acquiredAt);
  if (latest && acquiredAt.getTime() < latest.acquiredAt.getTime())
    throw new Error("Stale article acquisition cannot change latest revision");
  if (
    latest &&
    acquiredAt.getTime() === latest.acquiredAt.getTime() &&
    !sameFingerprint
  )
    throw new Error("Conflicting article acquisition at the same instant");
  if (!sameFingerprint) {
    await tx
      .insert(articleRevisions)
      .values(articleRevisionValues(article, record, latest, acquiredAt));
  }
  await tx
    .insert(articleEditionLinks)
    .values({
      articleId: record.id,
      editionId,
      topic: null,
    })
    .onConflictDoNothing();
  return !sameFingerprint;
}

async function readCommittedArticlePage(
  db: Database,
  run: CollectionRun,
): Promise<CollectionResult | null> {
  const [stored] = await db
    .select()
    .from(collectionRuns)
    .where(eq(collectionRuns.id, uuidSchema.parse(run.runId)));
  if (
    !stored ||
    stored.sourceId !== run.sourceId ||
    stored.cursorBefore !== run.cursorBefore ||
    stored.cursorGenerationBefore !== run.cursorGenerationBefore
  )
    throw new Error("Article collection run snapshot mismatch");
  if (stored.status === "failed")
    throw new CollectionError("schema", "Article collection run failed");
  if (stored.status !== "succeeded") return null;
  if (
    stored.hasMore === null ||
    stored.savedCount === null ||
    stored.quarantinedCount === null
  )
    throw new Error("Article page receipt incomplete");
  return {
    saved: stored.savedCount,
    quarantinedCount: stored.quarantinedCount,
    repeated: true,
    nextCursor: stored.cursorAfter,
    hasMore: stored.hasMore,
  };
}

function prepareArticlePage(
  run: CollectionRun,
  page: SourcePage<ArticleObservation>,
  destinations: readonly CollectionDestination[],
) {
  uuidSchema.parse(run.sourceId);
  uuidSchema.parse(run.runId);
  utcInstantSchema.parse(page.acquiredAt);
  if (!destinations.length || !Array.isArray(page.quarantined))
    throw new CollectionError(
      "schema",
      "Article page needs destinations and quarantine metadata",
    );
  const checkedDestinations = destinations.map((destination) => ({
    scope: editionScopeSchema.parse(destination.scope),
    raceId: destination.raceId,
  }));
  if (checkedDestinations.some((destination) => destination.raceId !== null))
    throw new CollectionError("schema", "Article source cannot bind a race");
  const sectionByEdition = new Map<string, string>();
  for (const destination of checkedDestinations) {
    const existing = sectionByEdition.get(destination.scope.editionId);
    if (existing && existing !== destination.scope.sectionId)
      throw new CollectionError(
        "schema",
        "Conflicting article destination scope",
      );
    sectionByEdition.set(
      destination.scope.editionId,
      destination.scope.sectionId,
    );
  }
  const uniqueDestinations = [
    ...new Map(
      checkedDestinations.map((destination) => [
        destination.scope.editionId,
        destination,
      ]),
    ).values(),
  ].sort((a, b) => a.scope.editionId.localeCompare(b.scope.editionId));
  const observations = page.observations.map((value) =>
    articleObservationSchema.parse(value),
  );
  const quarantined = page.quarantined.map((value) => ({
    externalId:
      value.externalId === null
        ? null
        : internalIdSchema.parse(value.externalId),
    contentHash: contentHashSchema.parse(value.contentHash),
    reasonCode: internalIdSchema.parse(value.reasonCode),
  }));
  const digest = pageHash(
    { ...page, observations, quarantined },
    uniqueDestinations,
  );
  return { uniqueDestinations, observations, quarantined, digest };
}

async function assertArticleCollectionTarget(
  tx: DatabaseTransaction,
  run: CollectionRun,
  uniqueDestinations: readonly CollectionDestination[],
) {
  await tx.execute(
    sql`SELECT id FROM configured_sources WHERE id = ${run.sourceId} FOR SHARE`,
  );
  const [source] = await tx
    .select({ enabled: configuredSources.enabled })
    .from(configuredSources)
    .where(eq(configuredSources.id, run.sourceId));
  if (!source?.enabled)
    throw new CollectionError("source_disabled", "Article source disabled");
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
    cursor.cursor !== run.cursorBefore
  )
    throw new CollectionError(
      "cursor_conflict",
      "Stale article run cannot advance cursor",
    );
  for (const destination of uniqueDestinations) {
    await tx.execute(
      sql`SELECT id FROM editions WHERE id = ${destination.scope.editionId} FOR SHARE`,
    );
    await tx.execute(
      sql`SELECT source_id FROM source_section_bindings WHERE source_id = ${run.sourceId} AND section_id = ${destination.scope.sectionId} FOR SHARE`,
    );
    const [bound] = await tx
      .select({ id: editions.id })
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
    if (!bound)
      throw new CollectionError("source_disabled", "Article binding disabled");
  }
  return cursor;
}

async function commitArticlePage(
  db: Database,
  {
    run,
    page,
    destinations,
  }: Parameters<CollectionPageStore<ArticleObservation>["commitPage"]>[0],
) {
  const { uniqueDestinations, observations, quarantined, digest } =
    prepareArticlePage(run, page, destinations);
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
      storedRun.cursorBefore !== run.cursorBefore ||
      storedRun.cursorGenerationBefore !== run.cursorGenerationBefore
    )
      throw new Error("Article collection run snapshot mismatch");
    if (storedRun.status === "succeeded") {
      if (storedRun.pageHash !== digest)
        throw new Error("Conflicting article page replay");
      return {
        saved: storedRun.savedCount ?? 0,
        quarantinedCount: storedRun.quarantinedCount ?? 0,
        repeated: true,
        nextCursor: storedRun.cursorAfter,
        hasMore: storedRun.hasMore ?? false,
      };
    }
    if (storedRun.status !== "running")
      throw new CollectionError(
        "schema",
        "Article collection run is not active",
      );
    const cursor = await assertArticleCollectionTarget(
      tx,
      run,
      uniqueDestinations,
    );
    let saved = 0;
    for (const observation of observations) {
      if (
        observation.provenance.sourceId !== run.sourceId ||
        observation.provenance.ingestionRunId !== run.runId ||
        observation.provenance.acquiredAt !== page.acquiredAt
      )
        throw new CollectionError(
          "schema",
          "Article provenance differs from page",
        );
      for (const destination of uniqueDestinations) {
        if (
          await recordArticleRevision(
            tx,
            observation,
            destination.scope.editionId,
          )
        )
          saved += 1;
      }
    }
    if (quarantined.length)
      await tx.insert(quarantinedObservations).values(
        quarantined.map((value) => ({
          runId: run.runId,
          sourceId: run.sourceId,
          acquiredAt: new Date(page.acquiredAt),
          ...value,
        })),
      );
    await tx
      .update(collectionRuns)
      .set({
        status: "succeeded",
        cursorAfter: page.nextCursor,
        hasMore: page.hasMore,
        pageHash: digest,
        pageAcquiredAt: new Date(page.acquiredAt),
        savedCount: saved,
        quarantinedCount: quarantined.length,
        completedAt: sql`clock_timestamp()`,
        errorCode: null,
      })
      .where(eq(collectionRuns.id, run.runId));
    await tx
      .update(sourceCursors)
      .set({
        cursor: page.nextCursor,
        generation: cursor.generation + 1,
        lastRunId: run.runId,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(eq(sourceCursors.sourceId, run.sourceId));
    return {
      saved,
      quarantinedCount: quarantined.length,
      repeated: false,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  });
}

/** Atomic article revisions, quarantine receipt and cursor CAS for one RSS page. */
export function createArticleCollectionPageStore(
  db: Database,
): CollectionPageStore<ArticleObservation> {
  return {
    readCommittedPage: (run) => readCommittedArticlePage(db, run),
    commitPage: (input) => commitArticlePage(db, input),
  };
}

export { readObservatoryArticlePage } from "./article-read-repository";
