import { sql } from "drizzle-orm";
import {
  editionScopeSchema,
  utcInstantSchema,
  type EditionScope,
} from "../../platform/data/primitives";
import type { NewsCoverage } from "../../platform/observatory/news-coverage";
import type { Database } from "./client";

/** Counts first acquisitions, not revisions, press sentiment or electorate opinion. */
export async function readNewsCoverage(
  db: Database,
  input: { scope: EditionScope; asOf: string; days?: number },
): Promise<NewsCoverage> {
  const scope = editionScopeSchema.parse(input.scope);
  const asOf = new Date(utcInstantSchema.parse(input.asOf));
  const days = input.days ?? 14;
  if (!Number.isInteger(days) || days < 1 || days > 31)
    throw new Error("Coverage window must be 1–31 days");
  const from = new Date(asOf.getTime() - days * 86_400_000);
  const [counts, changes] = await Promise.all([
    db.execute(sql`
      SELECT source.id AS source_id, source.name AS source_name, link.topic,
        to_char(revision.acquired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        count(*)::integer AS articles
      FROM article_edition_links link
      JOIN editions edition ON edition.id = link.edition_id AND edition.section_id = ${scope.sectionId}
      JOIN articles article ON article.id = link.article_id
      JOIN article_revisions revision ON revision.article_id = article.id AND revision.revision_no = 1
      JOIN configured_sources source ON source.id = article.source_id
      WHERE link.edition_id = ${scope.editionId}
        AND revision.acquired_at > ${from} AND revision.acquired_at <= ${asOf}
      GROUP BY source.id, source.name, link.topic, day
      ORDER BY day DESC, source.id, link.topic NULLS LAST LIMIT 1001
    `),
    db.execute(sql`
      SELECT count(*)::integer AS changes
      FROM admin_audit audit
      JOIN configured_sources source ON (
        (audit.action = 'source.enabled' AND audit.target_id = source.id::text) OR
        (audit.action = 'binding.enabled' AND audit.target_id = source.id::text || ':' || ${scope.sectionId})
      )
      JOIN providers provider ON provider.id = source.provider_id AND provider.family = 'articles'
      JOIN source_section_bindings binding ON binding.source_id = source.id AND binding.section_id = ${scope.sectionId}
      WHERE audit.recorded_at > ${from} AND audit.recorded_at <= ${asOf}
        AND audit.old_value IS DISTINCT FROM audit.new_value
    `),
  ]);
  const rows = counts.rows as {
    source_id: string;
    source_name: string;
    topic: string | null;
    day: string;
    articles: number;
  }[];
  return {
    from: from.toISOString(),
    asOf: asOf.toISOString(),
    days,
    truncated: rows.length > 1000,
    sourceChanges: Number(changes.rows[0]?.changes ?? 0),
    rows: rows.slice(0, 1000).map((row) => ({
      sourceId: row.source_id,
      sourceName: row.source_name,
      topic: row.topic,
      day: row.day,
      articles: row.articles,
    })),
  };
}
