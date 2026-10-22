import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { editions, configuredSources, collectionRuns } from "./catalog";
import { instant } from "./instant";

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
