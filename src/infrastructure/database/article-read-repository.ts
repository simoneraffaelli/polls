import { sql } from "drizzle-orm";
import type {
  ObservatoryArticle,
  ObservatoryPage,
  ObservatoryReadInput,
  ObservatorySource,
} from "../../platform/observatory/read-contracts";
import {
  editionScopeSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { Database } from "./client";
import { sourceState } from "./observatory-source-state";
import { rawEpochMillis, requiredRawInstant } from "./raw-time";

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
