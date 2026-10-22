import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  editionScopeSchema,
  internalIdSchema,
} from "../../platform/data/primitives";
import { forecastCutoffSchema } from "../../platform/publication/forecast";
import type { Database } from "./client";
import { adminAudit, editions, forecastQuestions, races } from "./schema";

const registrationSchema = z.strictObject({
  scope: editionScopeSchema,
  raceId: z.uuid().nullable(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  outcomeDefinition: z.enum(["seat_majority", "chamber_control"]),
  resolutionRuleVersion: internalIdSchema,
  cutoff: forecastCutoffSchema.refine((value) => value.version === 1, {
    message: "A new question starts with cutoff version 1",
  }),
  actorUserId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

/** Local controlled registration; the database records the initial cutoff revision. */
export async function registerForecastQuestion(db: Database, raw: unknown) {
  const input = registrationSchema.parse(raw);
  return db.transaction(async (tx) => {
    const member = await tx.execute(
      sql`SELECT user_id FROM admin_memberships WHERE user_id = ${input.actorUserId} AND revoked_at IS NULL FOR SHARE`,
    );
    if (member.rows.length !== 1)
      throw new Error("Question registration requires an active administrator");
    const [edition] = await tx
      .select({ id: editions.id })
      .from(editions)
      .where(
        and(
          eq(editions.id, input.scope.editionId),
          eq(editions.sectionId, input.scope.sectionId),
        ),
      );
    if (!edition) throw new Error("Question edition scope is invalid");
    if (input.raceId) {
      const [race] = await tx
        .select({ id: races.id })
        .from(races)
        .where(
          and(
            eq(races.id, input.raceId),
            eq(races.editionId, input.scope.editionId),
          ),
        );
      if (!race) throw new Error("Question race is outside edition");
    }
    const [question] = await tx
      .insert(forecastQuestions)
      .values({
        editionId: input.scope.editionId,
        raceId: input.raceId,
        slug: input.slug,
        outcomeDefinition: input.outcomeDefinition,
        resolutionRuleVersion: input.resolutionRuleVersion,
        cutoffAt: new Date(input.cutoff.utcInstant),
        cutoffLocal: input.cutoff.localDateTime,
        cutoffTimeZone: input.cutoff.timeZone,
        cutoffCalendarReference: input.cutoff.calendarReference,
        cutoffVersion: input.cutoff.version,
      })
      .returning({
        id: forecastQuestions.id,
        state: forecastQuestions.storedState,
      });
    if (!question) throw new Error("Question registration failed");
    await tx.insert(adminAudit).values({
      actorUserId: input.actorUserId,
      action: "forecast_question.register",
      targetType: "forecast_question",
      targetId: question.id,
      reason: input.reason,
    });
    return { id: question.id, state: question.state };
  });
}
