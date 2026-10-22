import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { forecastQuestions, questionCutoffRevisions } from "./catalog";
import { pollRevisions, pollEditionLinks } from "./polls";
import { instant } from "./instant";

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
