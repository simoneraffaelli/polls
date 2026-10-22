import { sql } from "drizzle-orm";
import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-identity";
import { configuredSources } from "./catalog";
import { instant } from "./instant";

export const adminMemberships = pgTable("admin_memberships", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  grantedAt: instant("granted_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  revokedAt: instant("revoked_at"),
});

export const adminAudit = pgTable("admin_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => user.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason"),
  oldValue: boolean("old_value"),
  newValue: boolean("new_value"),
  recordedAt: instant("recorded_at")
    .notNull()
    .default(sql`clock_timestamp()`),
});

export const adminImportPreviews = pgTable("admin_import_previews", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => user.id),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => configuredSources.id),
  sectionId: text("section_id").notNull(),
  editionId: text("edition_id").notNull(),
  raceId: uuid("race_id"),
  format: text("format").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: instant("created_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  expiresAt: instant("expires_at").notNull(),
  consumedAt: instant("consumed_at"),
});
