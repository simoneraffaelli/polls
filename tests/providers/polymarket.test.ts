import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { marketQuoteObservationSchema } from "../../src/platform/data/market";
import { createPolymarketBookAdapter } from "../../src/integrations/polymarket/adapter";
import { parsePolymarketBook } from "../../src/integrations/polymarket/book";

const book = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../fixtures/providers/polymarket-book-synthetic.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as Record<string, unknown>;
const expected = {
  marketId: "synthetic-condition-1",
  assetId: "synthetic-token-yes-1",
  timestampUnit: "seconds" as const,
};
const receivedAt = "2026-10-22T12:10:00.000Z";

describe("Polymarket documented order book shape", () => {
  it("uses best bid and ask in one snapshot, never last trade", () => {
    const result = parsePolymarketBook(book, receivedAt, expected);
    expect(result).toMatchObject({
      status: "accepted",
      observedAt: "2026-10-22T12:00:00.000Z",
      price: {
        kind: "bid_ask_midpoint",
        bid: 0.45,
        ask: 0.46,
        midpoint: 0.455,
        comparisonStatus: "eligible",
      },
    });
  });

  it("does not compare empty, crossed, wide or stale books", () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ ...book, bids: [] }, receivedAt, "missing_bid_or_ask"],
      [
        { ...book, bids: [{ price: "0.49", size: "1" }] },
        receivedAt,
        "crossed_book",
      ],
      [
        { ...book, asks: [{ price: "0.55", size: "1" }] },
        receivedAt,
        "wide_spread",
      ],
      [book, "2026-10-22T12:31:00.000Z", "stale"],
    ];
    for (const [candidate, acquiredAt, reason] of cases) {
      const result = parsePolymarketBook(candidate, acquiredAt, expected);
      expect(result.status).toBe("accepted");
      if (result.status === "accepted")
        expect(result.price).toMatchObject({ kind: "unavailable", reason });
    }
  });

  it("quarantines mismatched tokens, future snapshots and undocumented timestamps", () => {
    for (const [candidate, at, config] of [
      [book, receivedAt, { ...expected, assetId: "other-token" }],
      [book, "2026-10-22T11:59:59.000Z", expected],
      [{ ...book, timestamp: "1792670400000" }, receivedAt, expected],
    ] as const) {
      expect(parsePolymarketBook(candidate, at, config)).toEqual({
        status: "quarantined",
        reason: "invalid_or_unverified_book",
      });
    }
  });

  it("can parse explicitly configured milliseconds without guessing the unit", () => {
    const milliseconds = { ...book, timestamp: "1792670400000" };
    const result = parsePolymarketBook(milliseconds, receivedAt, {
      ...expected,
      timestampUnit: "milliseconds",
    });
    expect(result).toMatchObject({
      status: "accepted",
      observedAt: "2026-10-22T12:00:00.000Z",
    });
  });

  it("does not use floating-point noise to reject exactly five points of spread", () => {
    const result = parsePolymarketBook(
      {
        ...book,
        bids: [{ price: "0.50", size: "1" }],
        asks: [{ price: "0.55", size: "1" }],
      },
      receivedAt,
      expected,
    );
    expect(result).toMatchObject({
      status: "accepted",
      price: { kind: "bid_ask_midpoint", comparisonStatus: "eligible" },
    });
  });

  it("bounds order-book levels before selecting a best quote", () => {
    const oversized = {
      ...book,
      bids: Array.from({ length: 10_001 }, () => ({
        price: "0.45",
        size: "1",
      })),
    };
    expect(parsePolymarketBook(oversized, receivedAt, expected)).toEqual({
      status: "quarantined",
      reason: "invalid_or_unverified_book",
    });
  });
});

describe("Polymarket read-only adapter activation gates", () => {
  const budget = {
    maxPages: 1,
    maxRequests: 1,
    maxBytes: 100_000,
    maxResponseBytes: 100_000,
    maxDurationMs: 5_000,
    maxAttemptsPerGet: 1,
  };
  const run = {
    cursor: null,
    signal: new AbortController().signal,
    sourceId: "61ca479e-5996-4e1c-9e26-99a620c35483",
    runId: "25c2dc08-6512-40ae-8bb4-f4166bba5061",
  };

  it("is disabled by default and cannot fetch before explicit checks", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const adapter = createPolymarketBookAdapter({
      budget,
      ...expected,
      outcomeId: "yes",
      httpDependencies: { fetch: fetchMock },
    });
    await expect(adapter.fetchPage(run)).rejects.toThrow(
      "requires verified rights, resolution and timestamp format",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches only the configured token when all explicit gates are satisfied in a synthetic test", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(book), { status: 200 }));
    const adapter = createPolymarketBookAdapter({
      budget,
      ...expected,
      outcomeId: "yes",
      collectionEnabled: true,
      rightsVerified: true,
      resolutionEquivalent: true,
      timestampFormatVerified: true,
      httpDependencies: {
        fetch: fetchMock,
        now: () => Date.parse(receivedAt),
      },
    });
    const page = await adapter.fetchPage(run);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      "https://clob.polymarket.com/book?token_id=synthetic-token-yes-1",
    );
    expect(page.observations).toHaveLength(1);
    expect(page.observations[0]?.provenance.acquiredAt).toBe(receivedAt);
    expect(
      marketQuoteObservationSchema.safeParse(page.observations[0]).success,
    ).toBe(true);
  });
});
