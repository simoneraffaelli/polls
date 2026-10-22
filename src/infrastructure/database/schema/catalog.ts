import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { instant } from "./instant";

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
