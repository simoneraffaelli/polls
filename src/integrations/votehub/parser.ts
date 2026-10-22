import { z } from "zod";
import {
  calendarDateSchema,
  publicHttpUrlSchema,
} from "../../platform/data/primitives";

/** Only the generic-ballot shape observed in the licensed provider fixture is admitted. */
const voteHubGenericPollSchema = z
  .object({
    id: z.string().trim().min(1),
    poll_type: z.literal("generic-ballot"),
    sample_size: z.number().int().positive(),
    population: z.enum(["lv", "rv"]),
    url: publicHttpUrlSchema,
    created_at: calendarDateSchema,
    start_date: calendarDateSchema,
    end_date: calendarDateSchema,
    pollster: z.string().trim().min(1),
    answers: z
      .array(
        z.object({
          choice: z.enum(["Dem", "Rep"]),
          pct: z.number().finite().min(0).max(100),
        }),
      )
      .min(2),
    seat_name: z.union([z.null(), z.literal("Generic")]),
    sponsors: z.array(z.string().trim().min(1)),
    internal: z.literal(false),
    partisan: z.null(),
    subject: z.string().regex(/^\d{4}$/),
  })
  .superRefine((poll, context) => {
    if (poll.start_date > poll.end_date) {
      context.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "Fieldwork period is inverted",
      });
    }
    if (
      new Set(poll.answers.map((answer) => answer.choice)).size !==
      poll.answers.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "Duplicate choice",
      });
    }
    if (
      poll.answers.reduce((sum, answer) => sum + answer.pct, 0) > 100.000001
    ) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "Percentages exceed 100",
      });
    }
  });

export type VoteHubParsedPoll = {
  externalId: string;
  pollType: "generic_ballot";
  subject: string;
  seatName: null | "Generic";
  sourceUrl: string;
  /** Provider creation date is not assumed to be primary-source publication time. */
  providerCreatedDate: string;
  fieldworkStartDate: string;
  fieldworkEndDate: string;
  pollster: string;
  sponsors: string[];
  sampleSize: number;
  population:
    | { kind: "likely_voters"; description: "lv" }
    | { kind: "registered_voters"; description: "rv" };
  /** Stable across response pages; overlapping questions from one poll share this key. */
  sampleGroupId: string;
  options: Array<{
    optionId: "democrat" | "republican";
    label: "Dem" | "Rep";
    percentage: number;
  }>;
  wording: null;
};

export type VoteHubParseResult =
  | { status: "accepted"; poll: VoteHubParsedPoll }
  | { status: "quarantined"; reason: "invalid_or_unverified_shape" };

/** Unknown provider codes and unsupported races are quarantined, never mapped to zero or OTHER. */
export function parseVoteHubPoll(input: unknown): VoteHubParseResult {
  const result = voteHubGenericPollSchema.safeParse(input);
  if (!result.success)
    return { status: "quarantined", reason: "invalid_or_unverified_shape" };

  const poll = result.data;
  return {
    status: "accepted",
    poll: {
      externalId: poll.id,
      pollType: "generic_ballot",
      subject: poll.subject,
      seatName: poll.seat_name,
      sourceUrl: poll.url,
      providerCreatedDate: poll.created_at,
      fieldworkStartDate: poll.start_date,
      fieldworkEndDate: poll.end_date,
      pollster: poll.pollster,
      sponsors: poll.sponsors,
      sampleSize: poll.sample_size,
      population:
        poll.population === "lv"
          ? { kind: "likely_voters", description: "lv" }
          : { kind: "registered_voters", description: "rv" },
      sampleGroupId: `votehub:${poll.id}`,
      options: poll.answers.map((answer) => ({
        optionId: answer.choice === "Dem" ? "democrat" : "republican",
        label: answer.choice,
        percentage: answer.pct,
      })),
      wording: null,
    },
  };
}
