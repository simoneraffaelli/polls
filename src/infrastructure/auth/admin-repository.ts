import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../database/client";
import {
  adminAudit,
  collectionRuns,
  configuredSources,
  editions,
  providers,
  races,
  sections,
  sourceSectionBindings,
} from "../database/schema";
import type { AdminCommand } from "../../platform/admin/commands";

export async function readAdminOverview(db: Database) {
  const [sources, bindings, runs, destinations, raceChoices] =
    await Promise.all([
      db
        .select({
          id: configuredSources.id,
          name: configuredSources.name,
          providerId: configuredSources.providerId,
          family: providers.family,
          enabled: configuredSources.enabled,
          excluded: configuredSources.excludedFromForecasts,
          attribution: configuredSources.attribution,
        })
        .from(configuredSources)
        .innerJoin(providers, eq(configuredSources.providerId, providers.id))
        .orderBy(configuredSources.name),
      db
        .select({
          sourceId: sourceSectionBindings.sourceId,
          sectionId: sourceSectionBindings.sectionId,
          sectionName: sections.name,
          enabled: sourceSectionBindings.enabled,
        })
        .from(sourceSectionBindings)
        .innerJoin(sections, eq(sourceSectionBindings.sectionId, sections.id)),
      db
        .select({
          id: collectionRuns.id,
          sourceId: collectionRuns.sourceId,
          status: collectionRuns.status,
          startedAt: collectionRuns.startedAt,
          completedAt: collectionRuns.completedAt,
          errorCode: collectionRuns.errorCode,
          savedCount: collectionRuns.savedCount,
          quarantinedCount: collectionRuns.quarantinedCount,
        })
        .from(collectionRuns)
        .orderBy(desc(collectionRuns.startedAt))
        .limit(50),
      db
        .select({
          sectionId: editions.sectionId,
          editionId: editions.id,
          sectionName: sections.name,
          editionName: editions.name,
        })
        .from(editions)
        .innerJoin(sections, eq(editions.sectionId, sections.id)),
      db
        .select({ id: races.id, editionId: races.editionId, name: races.name })
        .from(races)
        .orderBy(races.name),
    ]);
  return { sources, bindings, runs, destinations, raceChoices };
}

export async function applyAdminCommand(
  db: Database,
  actorUserId: string,
  command: Exclude<AdminCommand, { action: "source.retry" }>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM configured_sources WHERE id = ${command.sourceId} FOR UPDATE`,
    );
    if (command.action === "binding.enabled") {
      const [source] = await tx
        .select({ id: configuredSources.id })
        .from(configuredSources)
        .where(eq(configuredSources.id, command.sourceId));
      const [section] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.id, command.sectionId));
      if (!source || !section) return false;
      const [previous] = await tx
        .select({ enabled: sourceSectionBindings.enabled })
        .from(sourceSectionBindings)
        .where(
          and(
            eq(sourceSectionBindings.sourceId, command.sourceId),
            eq(sourceSectionBindings.sectionId, command.sectionId),
          ),
        );
      await tx
        .insert(sourceSectionBindings)
        .values({
          sourceId: command.sourceId,
          sectionId: command.sectionId,
          enabled: command.enabled,
        })
        .onConflictDoUpdate({
          target: [
            sourceSectionBindings.sourceId,
            sourceSectionBindings.sectionId,
          ],
          set: { enabled: command.enabled },
        });
      await tx.insert(adminAudit).values({
        actorUserId,
        action: command.action,
        targetType: "source_section_binding",
        targetId: `${command.sourceId}:${command.sectionId}`,
        reason: command.reason,
        oldValue: previous?.enabled ?? null,
        newValue: command.enabled,
      });
      return true;
    }
    const [source] = await tx
      .select({
        id: configuredSources.id,
        enabled: configuredSources.enabled,
        excluded: configuredSources.excludedFromForecasts,
      })
      .from(configuredSources)
      .where(eq(configuredSources.id, command.sourceId));
    if (!source) return false;
    if (command.action === "source.enabled") {
      await tx
        .update(configuredSources)
        .set({ enabled: command.enabled })
        .where(eq(configuredSources.id, command.sourceId));
    } else {
      await tx
        .update(configuredSources)
        .set({ excludedFromForecasts: command.excluded })
        .where(eq(configuredSources.id, command.sourceId));
    }
    await tx.insert(adminAudit).values({
      actorUserId,
      action: command.action,
      targetType: "configured_source",
      targetId: command.sourceId,
      reason: command.reason,
      oldValue:
        command.action === "source.enabled" ? source.enabled : source.excluded,
      newValue:
        command.action === "source.enabled"
          ? command.enabled
          : command.excluded,
    });
    return true;
  });
}
