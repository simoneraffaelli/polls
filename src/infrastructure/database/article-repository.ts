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
import type {
  ObservatoryArticle,
  ObservatoryPage,
  ObservatoryReadInput,
  ObservatorySource,
} from "../../platform/observatory/read-contracts";
import type { Database } from "./client";
import { sourceState } from "./observatory-repository";
import { rawEpochMillis, requiredRawInstant } from "./raw-time";
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
  const sameFingerprint =
    latest &&
    latest.contentHash === article.provenance.contentHash &&
    latest.sourceRevision === article.provenance.sourceRevision &&
    latest.sourceUrl === article.provenance.sourceUrl &&
    latest.parserVersion === article.provenance.parserVersion &&
    latest.transformVersion === article.provenance.transformationVersion;
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
    const observed = article.provenance.observed;
    const published = article.provenance.declaredPublication;
    await tx.insert(articleRevisions).values({
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
      observedEndDate:
        observed.kind === "date_period" ? observed.endDate : null,
      observedAt: observed.kind === "instant" ? new Date(observed.at) : null,
      declaredPublicationKind: published?.kind ?? null,
      declaredPublicationDate:
        published?.kind === "date" ? published.date : null,
      declaredPublicationAt:
        published?.kind === "instant" ? new Date(published.at) : null,
      acquiredAt,
      parserVersion: article.provenance.parserVersion,
      transformVersion: article.provenance.transformationVersion,
      ingestionRunId: article.provenance.ingestionRunId,
    });
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

/** Atomic article revisions, quarantine receipt and cursor CAS for one RSS page. */
export function createArticleCollectionPageStore(
  db: Database,
): CollectionPageStore<ArticleObservation> {
  return {
    async readCommittedPage(
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
    },
    async commitPage({ run, page, destinations }) {
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
      if (
        checkedDestinations.some((destination) => destination.raceId !== null)
      )
        throw new CollectionError(
          "schema",
          "Article source cannot bind a race",
        );
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
            "Article source disabled",
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
            throw new CollectionError(
              "source_disabled",
              "Article binding disabled",
            );
        }
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
    },
  };
}

type ArticleRow = {
  article_id: string;
  revision_id: string;
  title: string;
  canonical_url: string;
  publisher: string;
  declared_publication_kind: string | null;
  declared_publication_date: string | null;
  declared_publication_epoch_ms: string | null;
  acquired_epoch_ms: string;
  excerpt: string | null;
  excerpt_reuse_permitted: boolean;
  source_id: string;
  source_name: string;
  attribution: string | null;
  terms_url: string | null;
  excluded_from_forecasts: boolean;
  source_enabled: boolean;
  binding_enabled: boolean | null;
  last_run_status: string | null;
  last_error_code: string | null;
  source_last_acquired_epoch_ms: string | null;
};

/** Bounded title/link reads; a pause never erases previously acquired articles. */
export async function readObservatoryArticlePage(
  db: Database,
  input: ObservatoryReadInput,
): Promise<ObservatoryPage<ObservatoryArticle>> {
  const scope = editionScopeSchema.parse(input.scope);
  const asOf = new Date(utcInstantSchema.parse(input.asOf));
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100
  )
    throw new Error("Observatory limit must be 1–100");
  if (
    !Number.isSafeInteger(input.staleAfterMinutes) ||
    input.staleAfterMinutes < 1 ||
    input.staleAfterMinutes > 100_000
  )
    throw new Error("Invalid observatory freshness threshold");
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000)
    throw new Error("Observatory offset must be 0–10,000");
  const result = await db.execute(sql`
    SELECT record.id AS article_id, revision.id AS revision_id,
      revision.title, record.canonical_url, revision.publisher,
      revision.declared_publication_kind,
      revision.declared_publication_date::text AS declared_publication_date,
      (floor(extract(epoch from revision.declared_publication_at) * 1000))::bigint AS declared_publication_epoch_ms,
      (floor(extract(epoch from revision.acquired_at) * 1000))::bigint AS acquired_epoch_ms,
      revision.excerpt, revision.excerpt_reuse_permitted,
      source.id AS source_id, source.name AS source_name,
      source.attribution, source.terms_url, source.excluded_from_forecasts,
      source.enabled AS source_enabled,
      binding.enabled AS binding_enabled,
      last_run.status AS last_run_status, last_run.error_code AS last_error_code,
      (floor(extract(epoch from last_success.page_acquired_at) * 1000))::bigint AS source_last_acquired_epoch_ms
    FROM article_edition_links link
    JOIN editions edition ON edition.id = link.edition_id
      AND edition.section_id = ${scope.sectionId}
    JOIN articles record ON record.id = link.article_id
    JOIN LATERAL (
      SELECT * FROM article_revisions revision
      WHERE revision.article_id = record.id AND revision.acquired_at <= ${asOf}
      ORDER BY revision.revision_no DESC LIMIT 1
    ) revision ON TRUE
    JOIN configured_sources source ON source.id = record.source_id
    LEFT JOIN source_section_bindings binding
      ON binding.source_id = source.id AND binding.section_id = ${scope.sectionId}
    LEFT JOIN LATERAL (
      SELECT status, error_code FROM collection_runs run
      WHERE run.source_id = source.id AND run.status IN ('succeeded', 'failed')
        AND coalesce(run.completed_at, run.started_at) <= ${asOf}
      ORDER BY coalesce(run.completed_at, run.started_at) DESC, run.id DESC LIMIT 1
    ) last_run ON TRUE
    LEFT JOIN LATERAL (
      SELECT page_acquired_at FROM collection_runs run
      WHERE run.source_id = source.id AND run.status = 'succeeded'
        AND run.page_acquired_at IS NOT NULL AND run.page_acquired_at <= ${asOf}
      ORDER BY run.page_acquired_at DESC, run.id DESC LIMIT 1
    ) last_success ON TRUE
    WHERE link.edition_id = ${scope.editionId}
    ORDER BY revision.acquired_at DESC, record.id DESC
    LIMIT ${input.limit + 1} OFFSET ${offset}
  `);
  const rows = result.rows as ArticleRow[];
  const hasMore = rows.length > input.limit;
  const items = rows.slice(0, input.limit).map((row) => {
    const source: ObservatorySource = {
      id: row.source_id,
      name: row.source_name,
      attribution: row.attribution,
      termsUrl: row.terms_url,
      excludedFromForecasts: row.excluded_from_forecasts,
      forecastExclusionReason: row.excluded_from_forecasts
        ? "source_excluded_from_future_forecasts"
        : null,
      state: sourceState({
        acquiredAt:
          rawEpochMillis(row.source_last_acquired_epoch_ms) ??
          requiredRawInstant(row.acquired_epoch_ms),
        sourceEnabled: row.source_enabled,
        bindingEnabled: row.binding_enabled ?? false,
        lastRunStatus: row.last_run_status,
        lastErrorCode: row.last_error_code,
        asOf,
        staleAfterMinutes: input.staleAfterMinutes,
      }),
    };
    return {
      articleId: row.article_id,
      revisionId: row.revision_id,
      title: row.title,
      url: row.canonical_url,
      publisher: row.publisher,
      publishedAt:
        row.declared_publication_kind === "date"
          ? row.declared_publication_date
          : (rawEpochMillis(row.declared_publication_epoch_ms)?.toISOString() ??
            null),
      acquiredAt: requiredRawInstant(row.acquired_epoch_ms).toISOString(),
      excerpt: row.excerpt_reuse_permitted ? row.excerpt : null,
      excerptReusePermitted: row.excerpt_reuse_permitted,
      source,
    };
  });
  const truncated = hasMore && offset + items.length > 10_000;
  return {
    items,
    hasMore,
    truncated,
    nextOffset: hasMore && !truncated ? offset + items.length : null,
  };
}
