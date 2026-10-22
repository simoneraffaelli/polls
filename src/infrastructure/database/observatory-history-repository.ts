import { sql } from "drizzle-orm";
import { z } from "zod";
import type {
  ObservatorySourceSummary,
  PollRevisionHistoryEntry,
  PollEditorialHistoryEntry,
  ObservatoryReadInput,
  ObservatoryPage,
} from "../../platform/observatory/read-contracts";
import type { Database } from "./client";
import { rawEpochMillis, requiredRawInstant } from "./raw-time";
import { sourceState } from "./observatory-source-state";
import { validateRead } from "./observatory-read-validation";

type SourceRow = {
  source_id: string;
  source_name: string;
  family: string;
  attribution: string | null;
  terms_url: string | null;
  excluded_from_forecasts: boolean;
  source_enabled: boolean;
  binding_enabled: boolean;
  last_run_status: string | null;
  last_error_code: string | null;
  last_acquired_epoch_ms: string | null;
  observation_count: string;
};

/** Lists configured section sources even when they have zero observations. */
export async function readObservatorySources(
  db: Database,
  input: ObservatoryReadInput,
): Promise<ObservatoryPage<ObservatorySourceSummary>> {
  const { scope, asOf, offset } = validateRead(input);
  const result = await db.execute(sql`
    SELECT source.id AS source_id, source.name AS source_name,
      provider.family, source.attribution, source.terms_url,
      source.excluded_from_forecasts, source.enabled AS source_enabled,
      binding.enabled AS binding_enabled,
      last_run.status AS last_run_status, last_run.error_code AS last_error_code,
      (floor(extract(epoch from greatest(last_success.page_acquired_at,
        poll_data.last_acquired_at, article_data.last_acquired_at)) * 1000))::bigint AS last_acquired_epoch_ms,
      CASE WHEN provider.family = 'polls' THEN poll_data.observation_count
           WHEN provider.family = 'articles' THEN article_data.observation_count
           ELSE 0 END AS observation_count
    FROM source_section_bindings binding
    JOIN configured_sources source ON source.id = binding.source_id
    JOIN providers provider ON provider.id = source.provider_id
    JOIN editions edition ON edition.section_id = binding.section_id
      AND edition.id = ${scope.editionId}
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
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT record.id)::bigint AS observation_count,
        max(revision.acquired_at) AS last_acquired_at
      FROM poll_edition_links link
      JOIN poll_records record ON record.id = link.poll_id AND record.source_id = source.id
      JOIN poll_revisions revision ON revision.poll_id = record.id
        AND revision.sealed = TRUE AND revision.acquired_at <= ${asOf}
      WHERE link.edition_id = ${scope.editionId}
    ) poll_data ON provider.family = 'polls'
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT record.id)::bigint AS observation_count,
        max(revision.acquired_at) AS last_acquired_at
      FROM article_edition_links link
      JOIN articles record ON record.id = link.article_id AND record.source_id = source.id
      JOIN article_revisions revision ON revision.article_id = record.id
        AND revision.acquired_at <= ${asOf}
      WHERE link.edition_id = ${scope.editionId}
    ) article_data ON provider.family = 'articles'
    WHERE binding.section_id = ${scope.sectionId}
    ORDER BY source.name, source.id
    LIMIT ${input.limit + 1} OFFSET ${offset}
  `);
  const rows = result.rows as SourceRow[];
  const hasMore = rows.length > input.limit;
  const items: ObservatorySourceSummary[] = rows
    .slice(0, input.limit)
    .map((row) => {
      const family = z.enum(["polls", "articles", "markets"]).parse(row.family);
      const count = Number(row.observation_count);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("Invalid source observation count");
      return {
        family,
        observationCount: count,
        source: {
          id: row.source_id,
          name: row.source_name,
          attribution: row.attribution,
          termsUrl: row.terms_url,
          excludedFromForecasts: row.excluded_from_forecasts,
          forecastExclusionReason: row.excluded_from_forecasts
            ? "source_excluded_from_future_forecasts"
            : null,
          state: sourceState({
            acquiredAt: rawEpochMillis(row.last_acquired_epoch_ms),
            sourceEnabled: row.source_enabled,
            bindingEnabled: row.binding_enabled,
            lastRunStatus: row.last_run_status,
            lastErrorCode: row.last_error_code,
            asOf,
            staleAfterMinutes: input.staleAfterMinutes,
          }),
        },
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

type RevisionHistoryRow = {
  poll_id: string;
  revision_id: string;
  revision_no: number;
  supersedes_revision_id: string | null;
  source_revision: string | null;
  content_hash: string;
  parser_version: string;
  acquired_epoch_ms: string;
  fieldwork_start: string;
  fieldwork_end: string;
};

export async function readPollRevisionHistory(
  db: Database,
  input: ObservatoryReadInput & Readonly<{ pollId: string }>,
): Promise<ObservatoryPage<PollRevisionHistoryEntry>> {
  const { scope, asOf, offset } = validateRead(input);
  const pollId = z.uuid().parse(input.pollId);
  const result = await db.execute(sql`
    SELECT record.id AS poll_id, revision.id AS revision_id,
      revision.revision_no, revision.supersedes_revision_id,
      revision.source_revision, revision.content_hash, revision.parser_version,
      (floor(extract(epoch from revision.acquired_at) * 1000))::bigint AS acquired_epoch_ms,
      revision.fieldwork_start::text AS fieldwork_start,
      revision.fieldwork_end::text AS fieldwork_end
    FROM poll_records record
    JOIN poll_revisions revision ON revision.poll_id = record.id
      AND revision.sealed = TRUE AND revision.acquired_at <= ${asOf}
    WHERE record.id = ${pollId} AND EXISTS (
      SELECT 1 FROM poll_edition_links link
      JOIN editions edition ON edition.id = link.edition_id
      WHERE link.poll_id = record.id AND link.edition_id = ${scope.editionId}
        AND link.created_at <= ${asOf}
        AND edition.section_id = ${scope.sectionId}
    )
    ORDER BY revision.revision_no DESC
    LIMIT ${input.limit + 1} OFFSET ${offset}
  `);
  const rows = result.rows as RevisionHistoryRow[];
  const hasMore = rows.length > input.limit;
  const items = rows.slice(0, input.limit).map((row) => ({
    pollId: row.poll_id,
    revisionId: row.revision_id,
    revisionNo: row.revision_no,
    supersedesRevisionId: row.supersedes_revision_id,
    sourceRevision: row.source_revision,
    contentHash: row.content_hash,
    parserVersion: row.parser_version,
    acquiredAt: requiredRawInstant(row.acquired_epoch_ms).toISOString(),
    fieldworkStart: row.fieldwork_start,
    fieldworkEnd: row.fieldwork_end,
  }));
  const truncated = hasMore && offset + items.length > 10_000;
  return {
    items,
    hasMore,
    truncated,
    nextOffset: hasMore && !truncated ? offset + items.length : null,
  };
}

/** Public editorial trail omits actor identity; admin audit retains the actor. */
export async function readPollEditorialHistory(
  db: Database,
  input: ObservatoryReadInput & Readonly<{ pollId: string }>,
): Promise<ObservatoryPage<PollEditorialHistoryEntry>> {
  const { scope, asOf, offset } = validateRead(input);
  const pollId = z.uuid().parse(input.pollId);
  const result = await db.execute(sql`
    SELECT decision.id, decision.kind, decision.link_id,
      decision.value,
      (floor(extract(epoch from decision.recorded_at) * 1000))::bigint AS recorded_epoch_ms
    FROM (
      SELECT item.id, 'forecast_exclusion' AS kind, NULL::uuid AS link_id,
        item.excluded AS value, item.recorded_at
      FROM poll_forecast_exclusions item
      WHERE item.poll_id = ${pollId} AND item.edition_id = ${scope.editionId}
        AND item.recorded_at <= ${asOf}
      UNION ALL
      SELECT item.id, 'association' AS kind, item.poll_link_id AS link_id,
        item.included AS value, item.recorded_at
      FROM poll_link_decisions item
      JOIN poll_edition_links link ON link.id = item.poll_link_id
      WHERE item.poll_id = ${pollId} AND item.edition_id = ${scope.editionId}
        AND item.recorded_at <= ${asOf} AND link.created_at <= ${asOf}
    ) decision
    JOIN editions edition ON edition.id = ${scope.editionId}
      AND edition.section_id = ${scope.sectionId}
    ORDER BY decision.recorded_at DESC, decision.id DESC
    LIMIT ${input.limit + 1} OFFSET ${offset}
  `);
  const rows = result.rows as {
    id: string;
    kind: string;
    link_id: string | null;
    value: boolean;
    recorded_epoch_ms: string;
  }[];
  const hasMore = rows.length > input.limit;
  const items = rows.slice(0, input.limit).map((row) => ({
    id: row.id,
    kind: z.enum(["forecast_exclusion", "association"]).parse(row.kind),
    linkId: row.link_id,
    value: row.value,
    recordedAt: requiredRawInstant(row.recorded_epoch_ms).toISOString(),
  }));
  const truncated = hasMore && offset + items.length > 10_000;
  return {
    items,
    hasMore,
    truncated,
    nextOffset: hasMore && !truncated ? offset + items.length : null,
  };
}
