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
    cursorAfter: text("cursor_after"),
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

export const pollEditionLinks = pgTable(
  "poll_edition_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
