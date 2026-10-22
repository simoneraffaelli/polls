import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-identity";
import { editions, races, configuredSources, collectionRuns } from "./catalog";
import { instant } from "./instant";

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
