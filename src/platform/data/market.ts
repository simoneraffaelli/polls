import { z } from "zod";
import { observationProvenanceSchema } from "./provenance";
import { internalIdSchema } from "./primitives";

const probabilityPrice = z.number().finite().min(0).max(1);

const midpointQuoteSchema = z.object({
  kind: z.literal("bid_ask_midpoint"),
  bid: probabilityPrice,
  ask: probabilityPrice,
  midpoint: probabilityPrice,
  spread: probabilityPrice,
  comparisonStatus: z.enum(["eligible", "excluded"]),
  exclusionReason: z.enum(["stale", "wide_spread", "other"]).nullable(),
}).superRefine(({ bid, ask, midpoint, spread, comparisonStatus, exclusionReason }, context) => {
  if (bid > ask) context.addIssue({ code: "custom", message: "Crossed bid/ask", path: ["ask"] });
  if (Math.abs(midpoint - (bid + ask) / 2) > 1e-9) {
    context.addIssue({ code: "custom", message: "Midpoint differs from bid/ask", path: ["midpoint"] });
  }
  if (Math.abs(spread - (ask - bid)) > 1e-9) {
    context.addIssue({ code: "custom", message: "Spread differs from bid/ask", path: ["spread"] });
  }
  if ((comparisonStatus === "eligible") !== (exclusionReason === null)) {
    context.addIssue({ code: "custom", message: "Comparison status needs a matching exclusion reason", path: ["exclusionReason"] });
  }
});

export const marketPriceSchema = z.union([
  midpointQuoteSchema,
  z.object({ kind: z.literal("last_trade"), price: probabilityPrice }),
  z.object({
    kind: z.literal("unavailable"),
    expectedPriceType: z.enum(["bid_ask_midpoint", "last_trade", "unknown"]),
    reason: z.enum(["missing_bid_or_ask", "crossed_book", "stale", "wide_spread", "invalid_price", "undocumented_measure"]),
    bid: probabilityPrice.nullable(),
    ask: probabilityPrice.nullable(),
  }),
]);

/** Last trades and unavailable quotes never qualify as midpoint comparisons. */
export const marketQuoteObservationSchema = z.object({
  provenance: observationProvenanceSchema,
  marketId: internalIdSchema,
  outcomeId: internalIdSchema,
  snapshotId: internalIdSchema,
  qualityPolicyVersion: internalIdSchema,
  price: marketPriceSchema,
}).refine(
  ({ provenance }) => provenance.observed.kind === "instant",
  { message: "A quote needs an observed instant", path: ["provenance", "observed"] },
);

export type MarketQuoteObservation = z.infer<typeof marketQuoteObservationSchema>;
