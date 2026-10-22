import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  forecastQuestions,
  configuredSources,
  collectionRuns,
} from "./catalog";
import { instant } from "./instant";

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
