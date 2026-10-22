import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-identity";
import { forecastQuestions } from "./catalog";
import { instant } from "./instant";

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
