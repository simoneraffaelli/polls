import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const countries = pgTable("countries", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const sections = pgTable(
  "sections",
  {
    id: text("id").primaryKey(),
    countryId: text("country_id")
      .notNull()
      .references(() => countries.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    unique("sections_country_slug_unique").on(table.countryId, table.slug),
    unique("sections_id_country_unique").on(table.id, table.countryId),
  ],
);

export const editions = pgTable(
  "editions",
  {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    unique("editions_section_slug_unique").on(table.sectionId, table.slug),
    unique("editions_id_section_unique").on(table.id, table.sectionId),
  ],
);

export const races = pgTable(
  "races",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    chamberCode: text("chamber_code"),
    territoryCode: text("territory_code"),
  },
  (table) => [
    unique("races_edition_slug_unique").on(table.editionId, table.slug),
    unique("races_id_edition_unique").on(table.id, table.editionId),
  ],
);

export const forecastQuestions = pgTable(
  "forecast_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id),
    raceId: uuid("race_id"),
    slug: text("slug").notNull(),
    outcomeDefinition: text("outcome_definition").notNull(),
    resolutionRuleVersion: text("resolution_rule_version").notNull(),
    cutoffAt: instant("cutoff_at").notNull(),
    cutoffLocal: text("cutoff_local").notNull(),
    cutoffTimeZone: text("cutoff_time_zone").notNull(),
    cutoffCalendarReference: text("cutoff_calendar_reference").notNull(),
    cutoffVersion: integer("cutoff_version").notNull(),
    storedState: text("stored_state").notNull().default("open"),
    resolutionStatus: text("resolution_status").notNull().default("pending"),
    verifiedOutcomeId: text("verified_outcome_id"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("forecast_questions_edition_slug_unique").on(
      table.editionId,
      table.slug,
    ),
    unique("forecast_questions_id_edition_unique").on(
      table.id,
      table.editionId,
    ),
    foreignKey({
      name: "forecast_questions_race_scope_fk",
      columns: [table.raceId, table.editionId],
      foreignColumns: [races.id, races.editionId],
    }),
    check(
      "forecast_questions_state_check",
      sql`${table.storedState} in ('open', 'closed', 'archived')`,
    ),
    check(
      "forecast_questions_resolution_check",
      sql`(${table.resolutionStatus} = 'pending' and ${table.verifiedOutcomeId} is null) or (${table.resolutionStatus} = 'verified' and ${table.verifiedOutcomeId} is not null)`,
    ),
    check(
      "forecast_questions_cutoff_version_check",
      sql`${table.cutoffVersion} > 0`,
    ),
  ],
);

export const questionCutoffRevisions = pgTable(
  "question_cutoff_revisions",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => forecastQuestions.id),
    version: integer("version").notNull(),
    cutoffAt: instant("cutoff_at").notNull(),
    cutoffLocal: text("cutoff_local").notNull(),
    timeZone: text("time_zone").notNull(),
    calendarReference: text("calendar_reference").notNull(),
    recordedAt: instant("recorded_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.version] })],
);

export const providers = pgTable("providers", {
  id: text("id").primaryKey(),
  family: text("family").notNull(),
  name: text("name").notNull(),
});

export const configuredSources = pgTable("configured_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: text("provider_id")
    .notNull()
    .references(() => providers.id),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  excludedFromForecasts: boolean("excluded_from_forecasts")
    .notNull()
    .default(false),
  attribution: text("attribution"),
  termsUrl: text("terms_url"),
  licenseNote: text("license_note"),
  createdAt: instant("created_at")
    .notNull()
    .default(sql`clock_timestamp()`),
});

export const sourceSectionBindings = pgTable(
  "source_section_bindings",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => configuredSources.id),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id),
    enabled: boolean("enabled").notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.sourceId, table.sectionId] })],
);

export const collectionRuns = pgTable(
  "collection_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => configuredSources.id),
    status: text("status").notNull(),
    cursorBefore: text("cursor_before"),
    cursorGenerationBefore: bigint("cursor_generation_before", {
      mode: "number",
    })
      .notNull()
      .default(0),
    cycleId: uuid("cycle_id").notNull().defaultRandom(),
    cycleStartedAt: instant("cycle_started_at")
      .notNull()
      .default(sql`clock_timestamp()`),
    pageIndex: integer("page_index").notNull().default(0),
    queueJobId: uuid("queue_job_id"),
    retryNotBefore: instant("retry_not_before"),
    attemptCount: integer("attempt_count").notNull().default(0),
    cursorAfter: text("cursor_after"),
    hasMore: boolean("has_more"),
    pageHash: text("page_hash"),
    pageAcquiredAt: instant("page_acquired_at"),
    savedCount: integer("saved_count"),
    quarantinedCount: integer("quarantined_count"),
    startedAt: instant("started_at")
      .notNull()
      .default(sql`clock_timestamp()`),
    completedAt: instant("completed_at"),
    errorCode: text("error_code"),
  },
  (table) => [
    unique("collection_runs_id_source_unique").on(table.id, table.sourceId),
    check(
      "collection_runs_status_check",
      sql`${table.status} in ('running', 'succeeded', 'failed')`,
    ),
  ],
);

export const sourceCursors = pgTable(
  "source_cursors",
  {
    sourceId: uuid("source_id")
      .primaryKey()
      .references(() => configuredSources.id),
    cursor: text("cursor"),
    generation: bigint("generation", { mode: "number" }).notNull().default(0),
    notBefore: instant("not_before"),
    blockedReasonCode: text("blocked_reason_code"),
    lastRunId: uuid("last_run_id"),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    foreignKey({
      name: "source_cursors_run_source_fk",
      columns: [table.lastRunId, table.sourceId],
      foreignColumns: [collectionRuns.id, collectionRuns.sourceId],
    }),
  ],
);

export const quarantinedObservations = pgTable(
  "quarantined_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    externalId: text("external_id"),
    contentHash: text("content_hash").notNull(),
    reasonCode: text("reason_code").notNull(),
    acquiredAt: instant("acquired_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "quarantine_run_source_fk",
      columns: [table.runId, table.sourceId],
      foreignColumns: [collectionRuns.id, collectionRuns.sourceId],
    }),
    check("quarantine_hash_check", sql`length(${table.contentHash}) = 64`),
  ],
);

export const pollRecords = pgTable(
  "poll_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => configuredSources.id),
    externalId: text("external_id").notNull(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("poll_records_source_external_unique").on(
      table.sourceId,
      table.externalId,
    ),
    unique("poll_records_id_source_unique").on(table.id, table.sourceId),
  ],
);

export const pollRevisions = pgTable(
  "poll_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sealed: boolean("sealed").notNull().default(false),
    pollId: uuid("poll_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    supersedesRevisionId: uuid("supersedes_revision_id"),
    sourceRevision: text("source_revision"),
    contentHash: text("content_hash").notNull(),
    sourceUrl: text("source_url").notNull(),
    pollster: text("pollster").notNull(),
    sponsors: text("sponsors").array().notNull(),
    fieldworkStart: date("fieldwork_start", { mode: "string" }).notNull(),
    fieldworkEnd: date("fieldwork_end", { mode: "string" }).notNull(),
    declaredPublicationKind: text("declared_publication_kind"),
    declaredPublicationDate: date("declared_publication_date", {
      mode: "string",
    }),
    declaredPublicationAt: instant("declared_publication_at"),
    acquiredAt: instant("acquired_at").notNull(),
    parserVersion: text("parser_version").notNull(),
    transformVersion: text("transform_version").notNull(),
    ingestionRunId: uuid("ingestion_run_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "poll_revisions_record_source_fk",
      columns: [table.pollId, table.sourceId],
      foreignColumns: [pollRecords.id, pollRecords.sourceId],
    }),
    foreignKey({
      name: "poll_revisions_run_source_fk",
      columns: [table.ingestionRunId, table.sourceId],
      foreignColumns: [collectionRuns.id, collectionRuns.sourceId],
    }),
    unique("poll_revisions_poll_no_unique").on(table.pollId, table.revisionNo),
    unique("poll_revisions_id_poll_unique").on(table.id, table.pollId),
    foreignKey({
      name: "poll_revisions_supersedes_same_poll_fk",
      columns: [table.supersedesRevisionId, table.pollId],
      foreignColumns: [table.id, table.pollId],
    }),
    check(
      "poll_revisions_fieldwork_check",
      sql`${table.fieldworkEnd} >= ${table.fieldworkStart}`,
    ),
    check("poll_revisions_no_positive_check", sql`${table.revisionNo} > 0`),
    check(
      "poll_revisions_publication_shape_check",
      sql`(${table.declaredPublicationKind} is null and ${table.declaredPublicationDate} is null and ${table.declaredPublicationAt} is null) or (${table.declaredPublicationKind} = 'date' and ${table.declaredPublicationDate} is not null and ${table.declaredPublicationAt} is null) or (${table.declaredPublicationKind} = 'instant' and ${table.declaredPublicationDate} is null and ${table.declaredPublicationAt} is not null)`,
    ),
  ],
);

/** A receipt survives later corrections, so a delayed retry cannot become a new revision. */
export const pollAcquisitions = pgTable(
  "poll_acquisitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    ingestionRunId: uuid("ingestion_run_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    sourceRevision: text("source_revision"),
    contentHash: text("content_hash").notNull(),
    sourceUrl: text("source_url").notNull(),
    parserVersion: text("parser_version").notNull(),
    transformVersion: text("transform_version").notNull(),
    acquiredAt: instant("acquired_at").notNull(),
  },
  (table) => [
    unique("poll_acquisitions_poll_run_unique").on(
      table.pollId,
      table.ingestionRunId,
    ),
    foreignKey({
      name: "poll_acquisitions_poll_source_fk",
      columns: [table.pollId, table.sourceId],
      foreignColumns: [pollRecords.id, pollRecords.sourceId],
    }),
    foreignKey({
      name: "poll_acquisitions_run_source_fk",
      columns: [table.ingestionRunId, table.sourceId],
      foreignColumns: [collectionRuns.id, collectionRuns.sourceId],
    }),
    foreignKey({
      name: "poll_acquisitions_revision_poll_fk",
      columns: [table.revisionId, table.pollId],
      foreignColumns: [pollRevisions.id, pollRevisions.pollId],
    }),
  ],
);

export const pollQuestions = pgTable(
  "poll_questions",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => pollRevisions.id),
    externalQuestionId: text("external_question_id").notNull(),
    wording: text("wording"),
    kind: text("kind").notNull(),
    populationKind: text("population_kind").notNull(),
    populationDescription: text("population_description").notNull(),
    sampleGroupId: text("sample_group_id").notNull(),
    sampleSize: integer("sample_size"),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.externalQuestionId] }),
  ],
);

export const pollOptions = pgTable(
  "poll_options",
  {
    revisionId: uuid("revision_id").notNull(),
    externalQuestionId: text("external_question_id").notNull(),
    optionId: text("option_id").notNull(),
    label: text("label").notNull(),
    percentage: numeric("percentage", { precision: 7, scale: 4 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.revisionId, table.externalQuestionId, table.optionId],
    }),
    foreignKey({
      name: "poll_options_question_fk",
      columns: [table.revisionId, table.externalQuestionId],
      foreignColumns: [
        pollQuestions.revisionId,
        pollQuestions.externalQuestionId,
      ],
    }),
    check(
      "poll_options_percentage_check",
      sql`${table.percentage} >= 0 and ${table.percentage} <= 100`,
    ),
  ],
);

/** A reviewer explicitly orients raw options to modeled party/caucus sides. */
export const pollModelOptionMappings = pgTable(
  "poll_model_option_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id").notNull(),
    externalQuestionId: text("external_question_id").notNull(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id),
    positiveOptionId: text("positive_option_id").notNull(),
    negativeOptionId: text("negative_option_id").notNull(),
    positivePartyId: text("positive_party_id").notNull(),
    negativePartyId: text("negative_party_id").notNull(),
    positiveCaucusId: text("positive_caucus_id"),
    negativeCaucusId: text("negative_caucus_id"),
    reviewedBy: text("reviewed_by")
      .notNull()
      .references(() => user.id),
    reason: text("reason").notNull(),
    reviewedAt: instant("reviewed_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    foreignKey({
      name: "poll_model_option_mappings_positive_fk",
      columns: [
        table.revisionId,
        table.externalQuestionId,
        table.positiveOptionId,
      ],
      foreignColumns: [
        pollOptions.revisionId,
        pollOptions.externalQuestionId,
        pollOptions.optionId,
      ],
    }),
    foreignKey({
      name: "poll_model_option_mappings_negative_fk",
      columns: [
        table.revisionId,
        table.externalQuestionId,
        table.negativeOptionId,
      ],
      foreignColumns: [
        pollOptions.revisionId,
        pollOptions.externalQuestionId,
        pollOptions.optionId,
      ],
    }),
    check(
      "poll_model_option_mappings_distinct_check",
      sql`${table.positiveOptionId} <> ${table.negativeOptionId} and ${table.positivePartyId} <> ${table.negativePartyId}`,
    ),
    index("poll_model_option_mappings_latest_idx").on(
      table.revisionId,
      table.externalQuestionId,
      table.raceId,
      table.reviewedAt,
    ),
  ],
);

export const pollEditionLinks = pgTable(
  "poll_edition_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`clock_timestamp()`),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => pollRecords.id),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id),
    raceId: uuid("race_id"),
  },
  (table) => [
    unique("poll_edition_links_identity_unique")
      .on(table.pollId, table.editionId, table.raceId)
      .nullsNotDistinct(),
    unique("poll_edition_links_id_scope_poll_unique").on(
      table.id,
      table.editionId,
      table.pollId,
    ),
    foreignKey({
      name: "poll_edition_links_race_scope_fk",
      columns: [table.raceId, table.editionId],
      foreignColumns: [races.id, races.editionId],
    }),
  ],
);

/** Append-only decisions affect future model input selection, never frozen run refs. */
export const pollForecastExclusions = pgTable(
  "poll_forecast_exclusions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => pollRecords.id),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id),
    excluded: boolean("excluded").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    reason: text("reason").notNull(),
    recordedAt: instant("recorded_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    index("poll_forecast_exclusions_latest_idx").on(
      table.pollId,
      table.editionId,
      table.recordedAt,
    ),
  ],
);

export const pollLinkDecisions = pgTable(
  "poll_link_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollLinkId: uuid("poll_link_id").notNull(),
    editionId: text("edition_id").notNull(),
    pollId: uuid("poll_id").notNull(),
    included: boolean("included").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    reason: text("reason").notNull(),
    recordedAt: instant("recorded_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    foreignKey({
      name: "poll_link_decisions_link_scope_fk",
      columns: [table.pollLinkId, table.editionId, table.pollId],
      foreignColumns: [
        pollEditionLinks.id,
        pollEditionLinks.editionId,
        pollEditionLinks.pollId,
      ],
    }),
    index("poll_link_decisions_latest_idx").on(
      table.pollLinkId,
      table.recordedAt,
    ),
  ],
);

export const marketContracts = pgTable(
  "market_contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => configuredSources.id),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    resolutionRules: text("resolution_rules").notNull(),
    closesAt: instant("closes_at"),
  },
  (table) => [
    unique("market_contracts_source_external_unique").on(
      table.sourceId,
      table.externalId,
    ),
    unique("market_contracts_id_source_unique").on(table.id, table.sourceId),
  ],
);

export const marketOutcomes = pgTable(
  "market_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    externalId: text("external_id").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    unique("market_outcomes_contract_external_unique").on(
      table.contractId,
      table.externalId,
    ),
    unique("market_outcomes_id_source_unique").on(table.id, table.sourceId),
    foreignKey({
      name: "market_outcomes_contract_source_fk",
      columns: [table.contractId, table.sourceId],
      foreignColumns: [marketContracts.id, marketContracts.sourceId],
    }),
  ],
);

export const marketQuestionLinks = pgTable(
  "market_question_links",
  {
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => marketOutcomes.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => forecastQuestions.id),
    editionId: text("edition_id").notNull(),
    equivalenceStatus: text("equivalence_status")
      .notNull()
      .default("unverified"),
    checkedAt: instant("checked_at"),
    explanation: text("explanation"),
  },
  (table) => [
    primaryKey({ columns: [table.outcomeId, table.questionId] }),
    foreignKey({
      name: "market_question_links_question_scope_fk",
      columns: [table.questionId, table.editionId],
      foreignColumns: [forecastQuestions.id, forecastQuestions.editionId],
    }),
    check(
      "market_question_links_status_check",
      sql`${table.equivalenceStatus} in ('unverified', 'equivalent', 'not_equivalent')`,
    ),
  ],
);

export const marketQuotes = pgTable(
  "market_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outcomeId: uuid("outcome_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    sourceRevision: text("source_revision"),
    contentHash: text("content_hash").notNull(),
    sourceUrl: text("source_url").notNull(),
    priceType: text("price_type").notNull(),
    bid: numeric("bid", { precision: 14, scale: 12 }),
    ask: numeric("ask", { precision: 14, scale: 12 }),
    midpoint: numeric("midpoint", { precision: 14, scale: 12 }),
    lastTrade: numeric("last_trade", { precision: 14, scale: 12 }),
    spread: numeric("spread", { precision: 14, scale: 12 }),
    comparisonStatus: text("comparison_status"),
    exclusionReason: text("exclusion_reason"),
    expectedPriceType: text("expected_price_type"),
    unavailableReason: text("unavailable_reason"),
    sourceObservedAt: instant("source_observed_at").notNull(),
    declaredPublicationKind: text("declared_publication_kind"),
    declaredPublicationDate: date("declared_publication_date", {
      mode: "string",
    }),
    declaredPublicationAt: instant("declared_publication_at"),
    acquiredAt: instant("acquired_at").notNull(),
    qualityPolicyVersion: text("quality_policy_version").notNull(),
    qualityState: text("quality_state").notNull(),
    parserVersion: text("parser_version").notNull(),
    transformVersion: text("transform_version").notNull(),
    ingestionRunId: uuid("ingestion_run_id").notNull(),
  },
  (table) => [
    unique("market_quotes_snapshot_revision_unique")
      .on(
        table.sourceId,
        table.outcomeId,
        table.snapshotId,
        table.sourceRevision,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: "market_quotes_outcome_source_fk",
      columns: [table.outcomeId, table.sourceId],
      foreignColumns: [marketOutcomes.id, marketOutcomes.sourceId],
    }),
    foreignKey({
      name: "market_quotes_run_source_fk",
      columns: [table.ingestionRunId, table.sourceId],
      foreignColumns: [collectionRuns.id, collectionRuns.sourceId],
    }),
    index("market_quotes_outcome_acquired_idx").on(
      table.outcomeId,
      table.acquiredAt,
    ),
    check(
      "market_quotes_price_type_check",
      sql`${table.priceType} in ('bid_ask_midpoint', 'last_trade', 'unavailable')`,
    ),
    check(
      "market_quotes_price_range_check",
      sql`(${table.bid} is null or ${table.bid} between 0 and 1) and (${table.ask} is null or ${table.ask} between 0 and 1) and (${table.midpoint} is null or ${table.midpoint} between 0 and 1) and (${table.lastTrade} is null or ${table.lastTrade} between 0 and 1) and (${table.spread} is null or ${table.spread} between 0 and 1)`,
    ),
    check(
      "market_quotes_shape_check",
      sql`(${table.priceType} = 'bid_ask_midpoint' and ${table.bid} is not null and ${table.ask} is not null and ${table.midpoint} is not null and ${table.spread} is not null and ${table.lastTrade} is null and ${table.bid} <= ${table.ask} and abs(${table.midpoint} - (${table.bid} + ${table.ask}) / 2) <= 0.00000001 and abs(${table.spread} - (${table.ask} - ${table.bid})) <= 0.00000001 and ${table.comparisonStatus} in ('eligible', 'excluded') and ((${table.comparisonStatus} = 'eligible' and ${table.exclusionReason} is null) or (${table.comparisonStatus} = 'excluded' and ${table.exclusionReason} is not null)) and ${table.expectedPriceType} is null and ${table.unavailableReason} is null) or (${table.priceType} = 'last_trade' and ${table.lastTrade} is not null and ${table.bid} is null and ${table.ask} is null and ${table.midpoint} is null and ${table.spread} is null and ${table.comparisonStatus} is null and ${table.exclusionReason} is null and ${table.expectedPriceType} is null and ${table.unavailableReason} is null) or (${table.priceType} = 'unavailable' and ${table.lastTrade} is null and ${table.midpoint} is null and ${table.spread} is null and ${table.comparisonStatus} is null and ${table.exclusionReason} is null and ${table.expectedPriceType} is not null and ${table.expectedPriceType} in ('bid_ask_midpoint', 'last_trade', 'unknown') and ${table.unavailableReason} is not null)`,
    ),
    check(
      "market_quotes_publication_shape_check",
      sql`(${table.declaredPublicationKind} is null and ${table.declaredPublicationDate} is null and ${table.declaredPublicationAt} is null) or (${table.declaredPublicationKind} = 'date' and ${table.declaredPublicationDate} is not null and ${table.declaredPublicationAt} is null) or (${table.declaredPublicationKind} = 'instant' and ${table.declaredPublicationDate} is null and ${table.declaredPublicationAt} is not null)`,
    ),
  ],
);

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => configuredSources.id),
    externalId: text("external_id").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("articles_source_external_unique").on(
      table.sourceId,
      table.externalId,
    ),
    unique("articles_id_source_unique").on(table.id, table.sourceId),
  ],
);

export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    supersedesRevisionId: uuid("supersedes_revision_id"),
    sourceRevision: text("source_revision"),
    contentHash: text("content_hash").notNull(),
    sourceUrl: text("source_url").notNull(),
    publisher: text("publisher").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    excerptReusePermitted: boolean("excerpt_reuse_permitted").notNull(),
    observedKind: text("observed_kind").notNull(),
    observedDate: date("observed_date", { mode: "string" }),
    observedStartDate: date("observed_start_date", { mode: "string" }),
    observedEndDate: date("observed_end_date", { mode: "string" }),
    observedAt: instant("observed_at"),
    language: text("language"),
    declaredPublicationKind: text("declared_publication_kind"),
    declaredPublicationDate: date("declared_publication_date", {
      mode: "string",
    }),
    declaredPublicationAt: instant("declared_publication_at"),
    acquiredAt: instant("acquired_at").notNull(),
    parserVersion: text("parser_version").notNull(),
    transformVersion: text("transform_version").notNull(),
    ingestionRunId: uuid("ingestion_run_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "article_revisions_article_source_fk",
      columns: [table.articleId, table.sourceId],
      foreignColumns: [articles.id, articles.sourceId],
    }),
    foreignKey({
      name: "article_revisions_run_source_fk",
      columns: [table.ingestionRunId, table.sourceId],
      foreignColumns: [collectionRuns.id, collectionRuns.sourceId],
    }),
    unique("article_revisions_article_no_unique").on(
      table.articleId,
      table.revisionNo,
    ),
    unique("article_revisions_id_article_unique").on(table.id, table.articleId),
    foreignKey({
      name: "article_revisions_supersedes_same_article_fk",
      columns: [table.supersedesRevisionId, table.articleId],
      foreignColumns: [table.id, table.articleId],
    }),
    check(
      "article_revisions_publication_shape_check",
      sql`(${table.declaredPublicationKind} is null and ${table.declaredPublicationDate} is null and ${table.declaredPublicationAt} is null) or (${table.declaredPublicationKind} = 'date' and ${table.declaredPublicationDate} is not null and ${table.declaredPublicationAt} is null) or (${table.declaredPublicationKind} = 'instant' and ${table.declaredPublicationDate} is null and ${table.declaredPublicationAt} is not null)`,
    ),
    check(
      "article_revisions_observed_shape_check",
      sql`(${table.observedKind} = 'date' and ${table.observedDate} is not null and ${table.observedStartDate} is null and ${table.observedEndDate} is null and ${table.observedAt} is null) or (${table.observedKind} = 'date_period' and ${table.observedDate} is null and ${table.observedStartDate} is not null and ${table.observedEndDate} is not null and ${table.observedEndDate} >= ${table.observedStartDate} and ${table.observedAt} is null) or (${table.observedKind} = 'instant' and ${table.observedDate} is null and ${table.observedStartDate} is null and ${table.observedEndDate} is null and ${table.observedAt} is not null)`,
    ),
    check(
      "article_revisions_excerpt_rights_check",
      sql`${table.excerpt} is null or ${table.excerptReusePermitted} = true`,
    ),
  ],
);

export const articleEditionLinks = pgTable(
  "article_edition_links",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id),
    topic: text("topic"),
  },
  (table) => [primaryKey({ columns: [table.articleId, table.editionId] })],
);

export const forecastRuns = pgTable(
  "forecast_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sealed: boolean("sealed").notNull().default(false),
    questionId: uuid("question_id").notNull(),
    editionId: text("edition_id").notNull(),
    runSequence: bigserial("run_sequence", { mode: "number" })
      .notNull()
      .unique(),
    kind: text("kind").notNull(),
    inputAsOf: instant("input_as_of").notNull(),
    inputSnapshotHash: text("input_snapshot_hash").notNull(),
    modelVersion: text("model_version").notNull(),
    modelStatus: text("model_status").notNull(),
    parameterVersion: text("parameter_version").notNull(),
    seed: text("seed").notNull(),
    qualityStatus: text("quality_status").notNull().default("incomplete"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`clock_timestamp()`),
    completedAt: instant("completed_at"),
    diagnostics: jsonb("diagnostics"),
  },
  (table) => [
    unique("forecast_runs_id_question_scope_unique").on(
      table.id,
      table.questionId,
      table.editionId,
    ),
    unique("forecast_runs_id_edition_unique").on(table.id, table.editionId),
    foreignKey({
      name: "forecast_runs_question_scope_fk",
      columns: [table.questionId, table.editionId],
      foreignColumns: [forecastQuestions.id, forecastQuestions.editionId],
    }),
    check(
      "forecast_runs_kind_check",
      sql`${table.kind} in ('forecast', 'retrospective_reconstruction')`,
    ),
    check(
      "forecast_runs_quality_check",
      sql`${table.qualityStatus} in ('complete', 'incomplete')`,
    ),
    check(
      "forecast_runs_model_status_check",
      sql`${table.modelStatus} in ('experimental', 'validated')`,
    ),
    check(
      "forecast_runs_completion_check",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`,
    ),
    check(
      "forecast_runs_input_as_of_check",
      sql`${table.inputAsOf} <= ${table.createdAt}`,
    ),
  ],
);

export const forecastRunPollInputs = pgTable(
  "forecast_run_poll_inputs",
  {
    runId: uuid("run_id").notNull(),
    editionId: text("edition_id").notNull(),
    pollLinkId: uuid("poll_link_id").notNull(),
    pollId: uuid("poll_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.revisionId] }),
    foreignKey({
      name: "forecast_run_inputs_run_scope_fk",
      columns: [table.runId, table.editionId],
      foreignColumns: [forecastRuns.id, forecastRuns.editionId],
    }),
    foreignKey({
      name: "forecast_run_inputs_link_scope_poll_fk",
      columns: [table.pollLinkId, table.editionId, table.pollId],
      foreignColumns: [
        pollEditionLinks.id,
        pollEditionLinks.editionId,
        pollEditionLinks.pollId,
      ],
    }),
    foreignKey({
      name: "forecast_run_inputs_revision_poll_fk",
      columns: [table.revisionId, table.pollId],
      foreignColumns: [pollRevisions.id, pollRevisions.pollId],
    }),
  ],
);

export const forecastResults = pgTable(
  "forecast_results",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => forecastRuns.id),
    outcomeId: text("outcome_id").notNull(),
    probability: numeric("probability", { precision: 9, scale: 8 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.outcomeId] }),
    check(
      "forecast_results_probability_check",
      sql`${table.probability} >= 0 and ${table.probability} <= 1`,
    ),
  ],
);

export const publicationHistory = pgTable(
  "publication_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id").notNull(),
    editionId: text("edition_id").notNull(),
    runId: uuid("run_id").notNull(),
    runSequence: bigint("run_sequence", { mode: "number" }).notNull(),
    inputAsOf: instant("input_as_of").notNull(),
    cutoffVersion: integer("cutoff_version").notNull(),
    cutoffAtPublication: instant("cutoff_at_publication").notNull(),
    publishedAt: instant("published_at").notNull(),
  },
  (table) => [
    unique("publication_history_run_unique").on(table.runId),
    unique("publication_history_pointer_unique").on(
      table.id,
      table.questionId,
      table.editionId,
      table.runId,
    ),
    foreignKey({
      name: "publication_history_run_scope_fk",
      columns: [table.runId, table.questionId, table.editionId],
      foreignColumns: [
        forecastRuns.id,
        forecastRuns.questionId,
        forecastRuns.editionId,
      ],
    }),
    foreignKey({
      name: "publication_history_cutoff_version_fk",
      columns: [table.questionId, table.cutoffVersion],
      foreignColumns: [
        questionCutoffRevisions.questionId,
        questionCutoffRevisions.version,
      ],
    }),
    check(
      "publication_history_before_cutoff_check",
      sql`${table.publishedAt} < ${table.cutoffAtPublication}`,
    ),
  ],
);

export const currentPublications = pgTable(
  "current_publications",
  {
    questionId: uuid("question_id").primaryKey(),
    editionId: text("edition_id").notNull(),
    publicationId: uuid("publication_id").notNull().unique(),
    runId: uuid("run_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "current_publications_question_scope_fk",
      columns: [table.questionId, table.editionId],
      foreignColumns: [forecastQuestions.id, forecastQuestions.editionId],
    }),
    foreignKey({
      name: "current_publications_run_scope_fk",
      columns: [table.runId, table.questionId, table.editionId],
      foreignColumns: [
        forecastRuns.id,
        forecastRuns.questionId,
        forecastRuns.editionId,
      ],
    }),
    foreignKey({
      name: "current_publications_history_scope_fk",
      columns: [
        table.publicationId,
        table.questionId,
        table.editionId,
        table.runId,
      ],
      foreignColumns: [
        publicationHistory.id,
        publicationHistory.questionId,
        publicationHistory.editionId,
        publicationHistory.runId,
      ],
    }),
  ],
);

/** Exact, immutable model inputs and outputs attached to one sealed forecast run. */
export const runModelSnapshots = pgTable(
  "run_model_snapshots",
  {
    runId: uuid("run_id").primaryKey(),
    questionId: uuid("question_id").notNull(),
    editionId: text("edition_id").notNull(),
    schemaVersion: text("schema_version").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    resultHash: text("result_hash").notNull(),
    iterations: integer("iterations").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    result: jsonb("result").notNull(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("run_model_snapshots_request_unique").on(
      table.questionId,
      table.snapshotHash,
      table.iterations,
    ),
    foreignKey({
      name: "run_model_snapshots_run_scope_fk",
      columns: [table.runId, table.questionId, table.editionId],
      foreignColumns: [
        forecastRuns.id,
        forecastRuns.questionId,
        forecastRuns.editionId,
      ],
    }),
    check(
      "run_model_snapshots_snapshot_hash_check",
      sql`length(${table.snapshotHash}) = 64`,
    ),
    check(
      "run_model_snapshots_result_hash_check",
      sql`length(${table.resultHash}) = 64`,
    ),
    check(
      "run_model_snapshots_iterations_check",
      sql`${table.iterations} between 100 and 20000`,
    ),
    check(
      "run_model_snapshots_snapshot_object_check",
      sql`jsonb_typeof(${table.snapshot}) = 'object'`,
    ),
    check(
      "run_model_snapshots_result_object_check",
      sql`jsonb_typeof(${table.result}) = 'object'`,
    ),
  ],
);

/** Reviewed structural assumptions are explicit inputs, never seeded forecasts. */
export const structuralModelReferences = pgTable(
  "structural_model_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id").notNull(),
    editionId: text("edition_id").notNull(),
    version: text("version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceVersion: text("source_version").notNull(),
    availableAt: instant("available_at").notNull(),
    acquiredAt: instant("acquired_at").notNull(),
    contentHash: text("content_hash").notNull(),
    payload: jsonb("payload").notNull(),
    reviewedBy: text("reviewed_by")
      .notNull()
      .references(() => user.id),
    reviewedAt: instant("reviewed_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("structural_model_references_question_version_unique").on(
      table.questionId,
      table.version,
    ),
    foreignKey({
      name: "structural_model_references_question_scope_fk",
      columns: [table.questionId, table.editionId],
      foreignColumns: [forecastQuestions.id, forecastQuestions.editionId],
    }),
    check(
      "structural_model_references_schema_check",
      sql`${table.schemaVersion} = 'structural-v1'`,
    ),
    check(
      "structural_model_references_hash_check",
      sql`length(${table.contentHash}) = 64`,
    ),
    check(
      "structural_model_references_time_check",
      sql`${table.availableAt} <= ${table.acquiredAt} and ${table.acquiredAt} <= ${table.reviewedAt}`,
    ),
    check(
      "structural_model_references_payload_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
  ],
);

/** Stable MEDSL contest identity; imports never replace a past revision. */
export const historicalResultRecords = pgTable(
  "historical_result_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetDoi: text("dataset_doi").notNull(),
    contestKey: text("contest_key").notNull(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("historical_result_records_identity_unique").on(
      table.datasetDoi,
      table.contestKey,
    ),
  ],
);

export const historicalResultRevisions = pgTable(
  "historical_result_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => historicalResultRecords.id),
    revisionNo: integer("revision_no").notNull(),
    supersedesRevisionId: uuid("supersedes_revision_id"),
    datasetVersion: text("dataset_version").notNull(),
    fileSha256: text("file_sha256").notNull(),
    contentHash: text("content_hash").notNull(),
    parserVersion: text("parser_version").notNull(),
    availableAt: instant("available_at").notNull(),
    acquiredAt: instant("acquired_at").notNull(),
    year: integer("year").notNull(),
    stateCode: text("state_code").notNull(),
    stage: text("stage").notNull(),
    special: boolean("special").notNull(),
    totalVotes: bigint("total_votes", { mode: "number" }).notNull(),
    unattributedVotes: bigint("unattributed_votes", {
      mode: "number",
    }).notNull(),
    candidates: jsonb("candidates").notNull(),
    marginStatus: text("margin_status").notNull(),
    leadingCandidate: text("leading_candidate"),
    marginVotes: bigint("margin_votes", { mode: "number" }),
    marginShare: numeric("margin_share", { precision: 12, scale: 10 }),
    exclusionReason: text("exclusion_reason"),
    sourceVersions: jsonb("source_versions").notNull(),
  },
  (table) => [
    unique("historical_result_revisions_record_no_unique").on(
      table.recordId,
      table.revisionNo,
    ),
    unique("historical_result_revisions_receipt_unique").on(
      table.recordId,
      table.datasetVersion,
      table.fileSha256,
      table.contentHash,
      table.parserVersion,
    ),
    unique("historical_result_revisions_id_record_unique").on(
      table.id,
      table.recordId,
    ),
    foreignKey({
      name: "historical_result_revisions_supersedes_same_record_fk",
      columns: [table.supersedesRevisionId, table.recordId],
      foreignColumns: [table.id, table.recordId],
    }),
    check("historical_result_revisions_no_check", sql`${table.revisionNo} > 0`),
    check(
      "historical_result_revisions_hash_check",
      sql`length(${table.fileSha256}) = 64 and length(${table.contentHash}) = 64`,
    ),
    check(
      "historical_result_revisions_year_check",
      sql`${table.year} between 1788 and 2100`,
    ),
    check(
      "historical_result_revisions_state_check",
      sql`length(${table.stateCode}) = 2`,
    ),
    check(
      "historical_result_revisions_votes_check",
      sql`${table.totalVotes} >= 0 and ${table.unattributedVotes} >= 0 and ${table.unattributedVotes} <= ${table.totalVotes}`,
    ),
    check(
      "historical_result_revisions_json_check",
      sql`jsonb_typeof(${table.candidates}) = 'array' and jsonb_typeof(${table.sourceVersions}) = 'array'`,
    ),
    check(
      "historical_result_revisions_margin_status_check",
      sql`${table.marginStatus} in ('eligible', 'excluded')`,
    ),
    check(
      "historical_result_revisions_margin_shape_check",
      sql`(${table.marginStatus} = 'eligible' and ${table.leadingCandidate} is not null and ${table.marginVotes} is not null and ${table.marginShare} is not null and ${table.exclusionReason} is null and ${table.marginVotes} >= 0 and ${table.marginShare} between 0 and 1) or (${table.marginStatus} = 'excluded' and ${table.leadingCandidate} is null and ${table.marginVotes} is null and ${table.marginShare} is null and ${table.exclusionReason} is not null)`,
    ),
  ],
);

// Better Auth's core Drizzle models. Keep property names aligned with its adapter.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: instant("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: instant("access_token_expires_at"),
    refreshTokenExpiresAt: instant("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: instant("expires_at").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const adminMemberships = pgTable("admin_memberships", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  grantedAt: instant("granted_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  revokedAt: instant("revoked_at"),
});

export const adminAudit = pgTable("admin_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => user.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason"),
  oldValue: boolean("old_value"),
  newValue: boolean("new_value"),
  recordedAt: instant("recorded_at")
    .notNull()
    .default(sql`clock_timestamp()`),
});

export const adminImportPreviews = pgTable("admin_import_previews", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => user.id),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => configuredSources.id),
  sectionId: text("section_id").notNull(),
  editionId: text("edition_id").notNull(),
  raceId: uuid("race_id"),
  format: text("format").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: instant("created_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  expiresAt: instant("expires_at").notNull(),
  consumedAt: instant("consumed_at"),
});
