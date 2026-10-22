import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { articleObservationSchema } from "../../src/platform/data/article";
import { createFederalReservePressAdapter } from "../../src/integrations/fed/adapter";
import {
  FED_PRESS_FEED_URL,
  parseFederalReservePressFeed,
} from "../../src/integrations/fed/parser";

const observedFixture = readFileSync(
  fileURLToPath(
    new URL("../fixtures/providers/fed-press-sample.xml", import.meta.url),
  ),
  "utf8",
);

// Synthetic item for the allowed category; the observed fixture is enforcement-only.
const policyFixture = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>Federal Reserve Board press releases</title><item>
<title>Federal Reserve Board announces monetary policy decision</title>
<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261015a.htm</link>
<guid>fed-policy-test-1</guid><category>Monetary Policy</category>
<pubDate>Thu, 15 Oct 2026 18:00:00 GMT</pubDate>
</item></channel></rss>`;

const budget = {
  maxPages: 1,
  maxRequests: 1,
  maxBytes: 100_000,
  maxResponseBytes: 100_000,
  maxDurationMs: 5_000,
  maxAttemptsPerGet: 1,
};

describe("Federal Reserve RSS source", () => {
  it("filters the observed enforcement-only item and rejects XML declarations of entities", () => {
    expect(parseFederalReservePressFeed(observedFixture)).toEqual({
      items: [],
      quarantined: [],
    });
    expect(() =>
      parseFederalReservePressFeed(
        `<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]>${policyFixture}`,
      ),
    ).toThrow("DTD or entity declaration rejected");
  });

  it("accepts only fixed-origin plain-text policy headlines with receipt provenance", async () => {
    const receivedAt = "2026-10-22T12:00:00.000Z";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(policyFixture, { status: 200 }));
    const adapter = createFederalReservePressAdapter({
      budget,
      maxItems: 2,
      httpDependencies: {
        fetch: fetchMock,
        now: () => Date.parse(receivedAt),
      },
    });
    const page = await adapter.fetchPage({
      cursor: null,
      signal: new AbortController().signal,
      sourceId: "61ca479e-5996-4e1c-9e26-99a620c35483",
      runId: "25c2dc08-6512-40ae-8bb4-f4166bba5061",
    });
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(FED_PRESS_FEED_URL);
    expect(page.observations).toHaveLength(1);
    expect(page.quarantined).toHaveLength(0);
    expect(page.acquiredAt).toBe(receivedAt);
    expect(page.observations[0]).toMatchObject({
      title: "Federal Reserve Board announces monetary policy decision",
      excerpt: null,
      excerptReusePermitted: false,
      provenance: {
        acquiredAt: receivedAt,
        declaredPublication: {
          kind: "instant",
          at: "2026-10-15T18:00:00.000Z",
        },
      },
    });
    expect(
      articleObservationSchema.safeParse(page.observations[0]).success,
    ).toBe(true);
  });

  it("quarantines malformed relevant items instead of publishing them", () => {
    const malformed = policyFixture.replace(
      "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261015a.htm",
      "https://example.com/unverified",
    );
    const parsed = parseFederalReservePressFeed(malformed);
    expect(parsed.items).toHaveLength(0);
    expect(parsed.quarantined).toMatchObject([
      {
        externalId: "fed-policy-test-1",
        reasonCode: "invalid_or_unverified_item",
      },
    ]);
  });

  it("quarantines a missing category but skips a known out-of-scope category", () => {
    const missing = policyFixture.replace(
      "<category>Monetary Policy</category>",
      "",
    );
    expect(parseFederalReservePressFeed(missing).quarantined).toMatchObject([
      { externalId: "fed-policy-test-1", reasonCode: "invalid_category" },
    ]);
    expect(parseFederalReservePressFeed(observedFixture).quarantined).toEqual(
      [],
    );
  });
});
