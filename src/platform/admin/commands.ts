import { z } from "zod";

const reason = z.string().trim().min(3).max(500);

export const adminCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("source.enabled"),
    sourceId: z.uuid(),
    enabled: z.boolean(),
    reason,
  }),
  z.object({
    action: z.literal("source.excluded"),
    sourceId: z.uuid(),
    excluded: z.boolean(),
    reason,
  }),
  z.object({
    action: z.literal("binding.enabled"),
    sourceId: z.uuid(),
    sectionId: z.string().min(1).max(120),
    enabled: z.boolean(),
    reason,
  }),
  z.object({ action: z.literal("source.retry"), sourceId: z.uuid(), reason }),
]);

export type AdminCommand = z.infer<typeof adminCommandSchema>;
