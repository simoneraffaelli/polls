import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type {
  ObservatoryPoll,
  ObservatoryPage,
  ObservatorySource,
  ObservatorySourceSummary,
  ObservatoryReadInput,
  PollReadInput,
  PollRevisionHistoryEntry,
  SourceState,
} from "../../platform/observatory/read-contracts";
import {
  calendarDateSchema,
  editionScopeSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { Database } from "./client";
import { rawEpochMillis, requiredRawInstant } from "./raw-time";
import { pollOptions, pollQuestions } from "./schema";

type PollRow = {
  poll_id: string;
  revision_id: string;
  revision_no: number;
  race_id: string | null;
  pollster: string;
  sponsors: string[];
  fieldwork_start: string;
  fieldwork_end: string;
  declared_publication_kind: string | null;
  declared_publication_date: string | null;
  declared_publication_epoch_ms: string | null;
  acquired_epoch_ms: string;
  source_url: string;
  source_id: string;
  source_name: string;
  attribution: string | null;
  terms_url: string | null;
  excluded_from_forecasts: boolean;
  source_enabled: boolean;
  binding_enabled: boolean;
  last_run_status: string | null;
  last_error_code: string | null;
  source_last_acquired_epoch_ms: string | null;
};

export function sourceState(input: {
  acquiredAt: Date | null;
  sourceEnabled: boolean;
  bindingEnabled: boolean;
  lastRunStatus: string | null;
  lastErrorCode: string | null;
  asOf: Date;
  staleAfterMinutes: number;
}): SourceState {
  const lastErrorCode = input.lastErrorCode;
  const acquiredAt = input.acquiredAt?.toISOString() ?? null;
  if (!input.sourceEnabled || !input.bindingEnabled)
    return { status: "paused", acquiredAt, lastErrorCode };
  if (input.lastRunStatus === "failed")
    return { status: "error", acquiredAt, lastErrorCode };
  if (!input.acquiredAt)
    return { status: "unavailable", acquiredAt: null, lastErrorCode };
  const age = input.asOf.getTime() - input.acquiredAt.getTime();
  if (age > input.staleAfterMinutes * 60_000)
    return { status: "stale", acquiredAt, lastErrorCode };
  return { status: "current", acquiredAt, lastErrorCode };
}

function validateRead(input: PollReadInput) {
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
  const raceId =
    input.raceId === undefined || input.raceId === null
      ? input.raceId
      : z.uuid().parse(input.raceId);
  const sourceId =
    input.sourceId === undefined ? undefined : z.uuid().parse(input.sourceId);
  const populationKind =
    input.populationKind === undefined
      ? undefined
      : z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(/^[a-z][a-z0-9_]*$/)
          .parse(input.populationKind);
  const fromDate =
    input.fromDate === undefined
      ? undefined
      : calendarDateSchema.parse(input.fromDate);
  const toDate =
    input.toDate === undefined
      ? undefined
      : calendarDateSchema.parse(input.toDate);
  if (fromDate && toDate && fromDate > toDate)
    throw new Error("Observatory date range is reversed");
  return {
    scope,
    asOf,
    raceId,
    sourceId,
    populationKind,
    fromDate,
    toDate,
    offset,
  };
}

/** Last sealed revision as of the requested instant, retaining history when a source pauses. */
export async function readObservatoryPollPage(
  db: Database,
  input: PollReadInput,
): Promise<ObservatoryPage<ObservatoryPoll>> {
  const {
    scope,
    asOf,
    raceId,
    sourceId,
    populationKind,
    fromDate,
    toDate,
    offset,
  } = validateRead(input);
  const racePredicate =
    raceId === undefined
      ? sql``
      : raceId === null
        ? sql`AND link.race_id IS NULL`
        : sql`AND link.race_id = ${raceId}`;
  const sourcePredicate = sourceId ? sql`AND source.id = ${sourceId}` : sql``;
  const populationPredicate = populationKind
    ? sql`AND EXISTS (
    SELECT 1 FROM poll_questions question
    WHERE question.revision_id = revision.id AND question.population_kind = ${populationKind}
  )`
    : sql``;
  const fromPredicate = fromDate
    ? sql`AND revision.fieldwork_end >= ${fromDate}`
    : sql``;
  const toPredicate = toDate
    ? sql`AND revision.fieldwork_start <= ${toDate}`
    : sql``;
  const result = await db.execute(sql`
    SELECT
      record.id AS poll_id, revision.id AS revision_id,
      revision.revision_no, link.race_id, revision.pollster,
      revision.sponsors, revision.fieldwork_start::text AS fieldwork_start,
      revision.fieldwork_end::text AS fieldwork_end,
      revision.declared_publication_kind,
      revision.declared_publication_date::text AS declared_publication_date,
      (floor(extract(epoch from revision.declared_publication_at) * 1000))::bigint AS declared_publication_epoch_ms,
      (floor(extract(epoch from revision.acquired_at) * 1000))::bigint AS acquired_epoch_ms,
      revision.source_url, source.id AS source_id, source.name AS source_name,
      source.attribution, source.terms_url, source.excluded_from_forecasts,
      source.enabled AS source_enabled,
      binding.enabled AS binding_enabled,
      last_run.status AS last_run_status,
      last_run.error_code AS last_error_code,
      (floor(extract(epoch from last_success.page_acquired_at) * 1000))::bigint AS source_last_acquired_epoch_ms
    FROM poll_edition_links link
    JOIN editions edition ON edition.id = link.edition_id
      AND edition.section_id = ${scope.sectionId}
    JOIN poll_records record ON record.id = link.poll_id
    JOIN LATERAL (
      SELECT * FROM poll_revisions revision
      WHERE revision.poll_id = record.id
        AND revision.sealed = TRUE
        AND revision.acquired_at <= ${asOf}
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
        AND run.page_acquired_at IS NOT NULL
        AND run.page_acquired_at <= ${asOf}
      ORDER BY run.page_acquired_at DESC, run.id DESC LIMIT 1
    ) last_success ON TRUE
    WHERE link.edition_id = ${scope.editionId} ${racePredicate}
      ${sourcePredicate} ${populationPredicate} ${fromPredicate} ${toPredicate}
    ORDER BY revision.acquired_at DESC, record.id DESC
    LIMIT ${input.limit + 1} OFFSET ${offset}
  `);
  const rows = result.rows as PollRow[];
  const hasMore = rows.length > input.limit;
  const selectedRows = rows.slice(0, input.limit);
  if (!selectedRows.length)
    return { items: [], hasMore: false, truncated: false, nextOffset: null };
  const revisionIds = selectedRows.map((row) => row.revision_id);
  const questions = await db
    .select()
    .from(pollQuestions)
    .where(inArray(pollQuestions.revisionId, revisionIds));
  const options = await db
    .select()
    .from(pollOptions)
    .where(inArray(pollOptions.revisionId, revisionIds));
  const items = selectedRows.map((row) => {
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
      pollId: row.poll_id,
      revisionId: row.revision_id,
      revisionNo: row.revision_no,
      raceId: row.race_id,
      pollster: row.pollster,
      sponsors: row.sponsors,
      fieldworkStart: row.fieldwork_start,
      fieldworkEnd: row.fieldwork_end,
      declaredPublication:
        row.declared_publication_kind === "date"
          ? row.declared_publication_date
          : (rawEpochMillis(row.declared_publication_epoch_ms)?.toISOString() ??
            null),
      acquiredAt: requiredRawInstant(row.acquired_epoch_ms).toISOString(),
      sourceUrl: row.source_url,
      source,
      questions: questions
        .filter(
          (question) =>
            question.revisionId === row.revision_id &&
            (populationKind === undefined ||
              question.populationKind === populationKind),
        )
        .sort((a, b) =>
          a.externalQuestionId.localeCompare(b.externalQuestionId),
        )
        .map((question) => ({
          id: question.externalQuestionId,
          wording: question.wording,
          kind: question.kind,
          populationKind: question.populationKind,
          populationDescription: question.populationDescription,
          sampleGroupId: question.sampleGroupId,
          sampleSize: question.sampleSize,
          options: options
            .filter(
              (option) =>
                option.revisionId === row.revision_id &&
                option.externalQuestionId === question.externalQuestionId,
            )
            .sort((a, b) => a.optionId.localeCompare(b.optionId))
            .map((option) => ({
              id: option.optionId,
              label: option.label,
              percentage: Number(option.percentage),
            })),
        })),
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
