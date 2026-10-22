import { z } from "zod";

const reason = z.string().trim().min(3).max(500);
const scope = z.object({
  sectionId: z.string().min(1).max(120),
  editionId: z.string().min(1).max(120),
});

export const adminPollCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("poll.excluded"),
    scope,
    pollId: z.uuid(),
    excluded: z.boolean(),
    reason,
  }),
  z.object({
    action: z.literal("poll.reassociate"),
    scope,
    pollId: z.uuid(),
    oldLinkId: z.uuid(),
    raceId: z.uuid().nullable(),
    reason,
  }),
]);

export type AdminPollCommand = z.infer<typeof adminPollCommandSchema>;
