import { inArray, sql } from "drizzle-orm";
import type {
  ObservatoryPoll,
  ObservatoryPage,
  ObservatorySource,
  PollReadInput,
} from "../../platform/observatory/read-contracts";
import type { Database } from "./client";
import { rawEpochMillis, requiredRawInstant } from "./raw-time";
import { pollOptions, pollQuestions } from "./schema";

function paged<T>(
  items: T[],
  hasMore: boolean,
  offset: number,
): ObservatoryPage<T> {
  const truncated = hasMore && offset + items.length > 10_000;
  return {
    items,
    hasMore,
    truncated,
    nextOffset: hasMore && !truncated ? offset + items.length : null,
  };
}

type PollRow = {
  poll_id: string;
  link_id: string;
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
  current_link_included: boolean | null;
  poll_excluded: boolean | null;
};

import { sourceState } from "./observatory-source-state";
export { sourceState } from "./observatory-source-state";

import { validateRead } from "./observatory-read-validation";

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
      record.id AS poll_id, link.id AS link_id, revision.id AS revision_id,
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
      (floor(extract(epoch from last_success.page_acquired_at) * 1000))::bigint AS source_last_acquired_epoch_ms,
      link_decision.included AS current_link_included,
      poll_exclusion.excluded AS poll_excluded
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
    LEFT JOIN LATERAL (
      SELECT included FROM poll_link_decisions decision
      WHERE decision.poll_link_id = link.id AND decision.recorded_at <= ${asOf}
      ORDER BY decision.recorded_at DESC, decision.id DESC LIMIT 1
    ) link_decision ON TRUE
    LEFT JOIN LATERAL (
      SELECT excluded FROM poll_forecast_exclusions exclusion
      WHERE exclusion.poll_id = record.id AND exclusion.edition_id = link.edition_id
        AND exclusion.recorded_at <= ${asOf}
      ORDER BY exclusion.recorded_at DESC, exclusion.id DESC LIMIT 1
    ) poll_exclusion ON TRUE
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
    WHERE link.edition_id = ${scope.editionId} AND link.created_at <= ${asOf} ${racePredicate}
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
      linkId: row.link_id,
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
      currentLinkIncluded: row.current_link_included ?? true,
      linkDecisionReason:
        row.current_link_included === false
          ? ("association_superseded" as const)
          : null,
      excludedFromFutureForecasts:
        row.excluded_from_forecasts ||
        (row.poll_excluded ?? false) ||
        row.current_link_included === false,
      pollExclusionReason: row.poll_excluded
        ? ("poll_excluded_from_future_forecasts" as const)
        : null,
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
  return paged(items, hasMore, offset);
}

export {
  readObservatorySources,
  readPollRevisionHistory,
  readPollEditorialHistory,
} from "./observatory-history-repository";
