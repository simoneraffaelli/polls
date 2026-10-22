import { and, desc, eq, sql } from "drizzle-orm";
import type { AdminPollCommand } from "../../platform/admin/poll-commands";
import type { Database } from "../database/client";
import {
  adminAudit,
  editions,
  pollEditionLinks,
  pollForecastExclusions,
  pollLinkDecisions,
  pollRecords,
  races,
} from "../database/schema";

export class AdminPollConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminPollConflict";
  }
}

/** Every edit records a new decision; source revisions and published run inputs remain immutable. */
export async function applyAdminPollCommand(
  db: Database,
  actorUserId: string,
  command: AdminPollCommand,
) {
  return db.transaction(async (tx) => {
    const [edition] = await tx
      .select({ id: editions.id })
      .from(editions)
      .where(
        and(
          eq(editions.id, command.scope.editionId),
          eq(editions.sectionId, command.scope.sectionId),
        ),
      )
      .limit(1);
    if (!edition) return null;
    await tx.execute(
      sql`SELECT id FROM poll_records WHERE id = ${command.pollId} FOR UPDATE`,
    );
    const [record] = await tx
      .select({ id: pollRecords.id })
      .from(pollRecords)
      .where(eq(pollRecords.id, command.pollId))
      .limit(1);
    if (!record) return null;
    const [existingLink] = await tx
      .select({ id: pollEditionLinks.id, raceId: pollEditionLinks.raceId })
      .from(pollEditionLinks)
      .where(
        and(
          eq(pollEditionLinks.pollId, command.pollId),
          eq(pollEditionLinks.editionId, edition.id),
          command.action === "poll.reassociate"
            ? eq(pollEditionLinks.id, command.oldLinkId)
            : sql`TRUE`,
        ),
      )
      .limit(1);
    if (!existingLink) return null;
    if (command.action === "poll.excluded") {
      const [previous] = await tx
        .select({ excluded: pollForecastExclusions.excluded })
        .from(pollForecastExclusions)
        .where(
          and(
            eq(pollForecastExclusions.pollId, command.pollId),
            eq(pollForecastExclusions.editionId, edition.id),
          ),
        )
        .orderBy(
          desc(pollForecastExclusions.recordedAt),
          desc(pollForecastExclusions.id),
        )
        .limit(1);
      const [decision] = await tx
        .insert(pollForecastExclusions)
        .values({
          pollId: command.pollId,
          editionId: edition.id,
          excluded: command.excluded,
          actorUserId,
          reason: command.reason,
        })
        .returning({ id: pollForecastExclusions.id });
      await tx.insert(adminAudit).values({
        actorUserId,
        action: command.action,
        targetType: "poll_record",
        targetId: command.pollId,
        reason: command.reason,
        oldValue: previous?.excluded ?? false,
        newValue: command.excluded,
      });
      return {
        decisionId: decision.id,
        pollId: command.pollId,
        linkId: existingLink.id,
      };
    }
    const [currentDecision] = await tx
      .select({ included: pollLinkDecisions.included })
      .from(pollLinkDecisions)
      .where(eq(pollLinkDecisions.pollLinkId, existingLink.id))
      .orderBy(desc(pollLinkDecisions.recordedAt), desc(pollLinkDecisions.id))
      .limit(1);
    if (currentDecision?.included === false)
      throw new AdminPollConflict("Poll association was already superseded");
    if (existingLink.raceId === command.raceId)
      throw new AdminPollConflict("Poll association is unchanged");
    if (command.raceId !== null) {
      const [race] = await tx
        .select({ id: races.id })
        .from(races)
        .where(
          and(eq(races.id, command.raceId), eq(races.editionId, edition.id)),
        )
        .limit(1);
      if (!race) return null;
    }
    await tx
      .insert(pollEditionLinks)
      .values({
        pollId: command.pollId,
        editionId: edition.id,
        raceId: command.raceId,
      })
      .onConflictDoNothing();
    const [newLink] = await tx
      .select({ id: pollEditionLinks.id })
      .from(pollEditionLinks)
      .where(
        and(
          eq(pollEditionLinks.pollId, command.pollId),
          eq(pollEditionLinks.editionId, edition.id),
          command.raceId === null
            ? sql`${pollEditionLinks.raceId} IS NULL`
            : eq(pollEditionLinks.raceId, command.raceId),
        ),
      )
      .limit(1);
    if (!newLink) throw new Error("Corrected poll association was not saved");
    await tx.insert(pollLinkDecisions).values([
      {
        pollLinkId: existingLink.id,
        editionId: edition.id,
        pollId: command.pollId,
        included: false,
        actorUserId,
        reason: command.reason,
      },
      {
        pollLinkId: newLink.id,
        editionId: edition.id,
        pollId: command.pollId,
        included: true,
        actorUserId,
        reason: command.reason,
      },
    ]);
    await tx.insert(adminAudit).values({
      actorUserId,
      action: command.action,
      targetType: "poll_edition_link",
      targetId: existingLink.id,
      reason: `${command.reason} | correctedLinkId=${newLink.id}`,
      oldValue: true,
      newValue: false,
    });
    return { decisionId: null, pollId: command.pollId, linkId: newLink.id };
  });
}

/** Small server-side admin list; includes excluded links so corrections remain reviewable. */
export async function readAdminPollLinks(db: Database, offset = 0) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000)
    throw new Error("Invalid admin poll offset");
  const rows = await db.execute(sql`
    SELECT link.id AS link_id, link.poll_id, link.edition_id, link.race_id,
      record.external_id, source.name AS source_name, revision.pollster,
      exclusion.excluded, exclusion.reason AS exclusion_reason,
      decision.included, decision.reason AS link_reason
    FROM poll_edition_links link
    JOIN poll_records record ON record.id = link.poll_id
    JOIN configured_sources source ON source.id = record.source_id
    JOIN LATERAL (SELECT pollster FROM poll_revisions revision
      WHERE revision.poll_id = record.id AND revision.sealed = TRUE
      ORDER BY revision.revision_no DESC LIMIT 1) revision ON TRUE
    LEFT JOIN LATERAL (SELECT excluded, reason FROM poll_forecast_exclusions item
      WHERE item.poll_id = record.id AND item.edition_id = link.edition_id
      ORDER BY item.recorded_at DESC, item.id DESC LIMIT 1) exclusion ON TRUE
    LEFT JOIN LATERAL (SELECT included, reason FROM poll_link_decisions item
      WHERE item.poll_link_id = link.id
      ORDER BY item.recorded_at DESC, item.id DESC LIMIT 1) decision ON TRUE
    ORDER BY record.created_at DESC, link.id DESC LIMIT 51 OFFSET ${offset}
  `);
  const typed = rows.rows as {
    link_id: string;
    poll_id: string;
    edition_id: string;
    race_id: string | null;
    external_id: string;
    source_name: string;
    pollster: string;
    excluded: boolean | null;
    exclusion_reason: string | null;
    included: boolean | null;
    link_reason: string | null;
  }[];
  return { items: typed.slice(0, 50), hasMore: typed.length > 50, offset };
}
