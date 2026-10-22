import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { instant } from "./instant";

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
