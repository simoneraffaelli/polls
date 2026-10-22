import { z } from "zod";
import type { MarketQuoteObservation } from "../../platform/data/market";

/** Proposed policy, not activated on a public market until rights and resolution are verified. */
export const MARKET_QUALITY_POLICY_VERSION = "market-quality-v1";
const MAX_SPREAD = 0.05;
const MAX_AGE_MS = 30 * 60 * 1000;

const price = z
  .string()
  .regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/)
  .transform(Number);
const level = z.object({ price, size: z.string().regex(/^\d+(?:\.\d+)?$/) });
const bookSchema = z.object({
  market: z.string().trim().min(1),
  asset_id: z.string().trim().min(1),
  // The official example has 10 digits; its unit is not specified in prose.
  timestamp: z.string().regex(/^(?:\d{10}|\d{13})$/),
  hash: z.string().trim().min(1),
  bids: z.array(level).max(10_000),
  asks: z.array(level).max(10_000),
});

type Price = MarketQuoteObservation["price"];

export type ParsedBook =
  | {
      status: "accepted";
      marketId: string;
      assetId: string;
      snapshotId: string;
      observedAt: string;
      price: Price;
    }
  | { status: "quarantined"; reason: "invalid_or_unverified_book" };

/** No last-trade fallback; best bid/ask come from the same book payload. */
export function parsePolymarketBook(
  input: unknown,
  receivedAt: string,
  expected: {
    marketId: string;
    assetId: string;
    timestampUnit: "seconds" | "milliseconds";
  },
): ParsedBook {
  const parsed = bookSchema.safeParse(input);
  const acquiredMs = Date.parse(receivedAt);
  if (
    !parsed.success ||
    !Number.isFinite(acquiredMs) ||
    parsed.data.market !== expected.marketId ||
    parsed.data.asset_id !== expected.assetId
  )
    return { status: "quarantined", reason: "invalid_or_unverified_book" };
  const book = parsed.data;
  if (
    (expected.timestampUnit === "seconds" && book.timestamp.length !== 10) ||
    (expected.timestampUnit === "milliseconds" && book.timestamp.length !== 13)
  )
    return { status: "quarantined", reason: "invalid_or_unverified_book" };
  const observedMs =
    Number(book.timestamp) * (expected.timestampUnit === "seconds" ? 1000 : 1);
  if (!Number.isFinite(observedMs) || observedMs > acquiredMs)
    return { status: "quarantined", reason: "invalid_or_unverified_book" };
  const observedAt = new Date(observedMs).toISOString();
  const bids = book.bids.filter((entry) => {
    const size = Number(entry.size);
    return Number.isFinite(size) && size > 0;
  });
  const asks = book.asks.filter((entry) => {
    const size = Number(entry.size);
    return Number.isFinite(size) && size > 0;
  });
  const bid = bids.reduce<number | null>(
    (best, entry) =>
      best === null ? entry.price : Math.max(best, entry.price),
    null,
  );
  const ask = asks.reduce<number | null>(
    (best, entry) =>
      best === null ? entry.price : Math.min(best, entry.price),
    null,
  );
  let priceValue: Price;
  if (bid === null || ask === null) {
    priceValue = {
      kind: "unavailable",
      expectedPriceType: "bid_ask_midpoint",
      reason: "missing_bid_or_ask",
      bid,
      ask,
    };
  } else if (bid > ask) {
    priceValue = {
      kind: "unavailable",
      expectedPriceType: "bid_ask_midpoint",
      reason: "crossed_book",
      bid,
      ask,
    };
  } else if (acquiredMs - observedMs > MAX_AGE_MS) {
    priceValue = {
      kind: "unavailable",
      expectedPriceType: "bid_ask_midpoint",
      reason: "stale",
      bid,
      ask,
    };
  } else if (ask - bid > MAX_SPREAD + 1e-9) {
    priceValue = {
      kind: "unavailable",
      expectedPriceType: "bid_ask_midpoint",
      reason: "wide_spread",
      bid,
      ask,
    };
  } else {
    priceValue = {
      kind: "bid_ask_midpoint",
      bid,
      ask,
      midpoint: (bid + ask) / 2,
      spread: ask - bid,
      comparisonStatus: "eligible",
      exclusionReason: null,
    };
  }
  return {
    status: "accepted",
    marketId: book.market,
    assetId: book.asset_id,
    snapshotId: book.hash,
    observedAt,
    price: priceValue,
  };
}
