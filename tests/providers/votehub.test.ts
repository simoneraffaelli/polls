import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { pollObservationSchema } from "../../src/elections/polling/poll";
import {
  createVoteHubGenericAdapter,
  VOTEHUB_GENERIC_2026_URL,
} from "../../src/integrations/votehub/adapter";
import { parseVoteHubPoll } from "../../src/integrations/votehub/parser";

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../fixtures/providers/votehub-generic-ballot.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as unknown[];
const senateFixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../fixtures/providers/votehub-senate-samples.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as unknown[];

const sourceId = "61ca479e-5996-4e1c-9e26-99a620c35483";
const runId = "25c2dc08-6512-40ae-8bb4-f4166bba5061";
const budget = {
  maxPages: 1,
  maxRequests: 1,
  maxBytes: 100_000,
  maxResponseBytes: 100_000,
  maxDurationMs: 5_000,
  maxAttemptsPerGet: 1,
};

describe("VoteHub generic ballot parser", () => {
  it("normalizes the observed licensed record without inventing question wording or publication time", () => {
    const result = parseVoteHubPoll(fixture[0]);
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;

    expect(result.poll).toMatchObject({
      externalId: "gen202you9adbf42a",
      pollType: "generic_ballot",
      subject: "2026",
      seatName: null,
      providerCreatedDate: "2026-10-04",
      fieldworkStartDate: "2026-09-30",
      fieldworkEndDate: "2026-10-02",
      population: { kind: "likely_voters", description: "lv" },
      sampleGroupId: "votehub:gen202you9adbf42a",
      wording: null,
      options: [
        { optionId: "democrat", label: "Dem", percentage: 54 },
        { optionId: "republican", label: "Rep", percentage: 45 },
      ],
    });
  });

  it("quarantines unsupported codes, invalid dates and missing sample rather than making up values", () => {
    const base = fixture[0] as Record<string, unknown>;
    for (const change of [
      { population: "unknown" },
      { answers: [{ choice: "Other", pct: 5 }] },
      { sample_size: null },
      { start_date: "2026-10-03" },
      { poll_type: "house" },
      { internal: true },
    ]) {
      expect(parseVoteHubPoll({ ...base, ...change })).toEqual({
        status: "quarantined",
        reason: "invalid_or_unverified_shape",
      });
    }
  });

  it("quarantines observed Senate records until race mapping and candidate semantics are verified", () => {
    expect(senateFixture).toHaveLength(2);
    for (const record of senateFixture)
      expect(parseVoteHubPoll(record).status).toBe("quarantined");
  });

  it("maps documented registered voters and the documented generic seat label", () => {
    const result = parseVoteHubPoll({
      ...(fixture[0] as Record<string, unknown>),
      population: "rv",
      seat_name: "Generic",
    });
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.poll.population).toEqual({
        kind: "registered_voters",
        description: "rv",
      });
      expect(result.poll.seatName).toBe("Generic");
    }
  });
});

describe("VoteHub generic ballot source adapter", () => {
  it("uses only the fixed feed, preserves receipt provenance and quarantines unsupported records", async () => {
    const observedAt = "2026-10-22T10:12:34.000Z";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([...fixture, ...senateFixture]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const adapter = createVoteHubGenericAdapter({
      budget,
      maxRecords: 3,
      httpDependencies: {
        fetch: fetchMock,
        now: () => Date.parse(observedAt),
      },
    });
    const page = await adapter.fetchPage({
      cursor: null,
      signal: new AbortController().signal,
      sourceId,
      runId,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      VOTEHUB_GENERIC_2026_URL,
    );
    expect(page.acquiredAt).toBe(observedAt);
    expect(page.observations).toHaveLength(1);
    expect(page.quarantined).toHaveLength(2);
    expect(page.quarantined.map((entry) => entry.externalId)).toEqual([
      "us-202bow14c3613e",
      "us-202thed1db38e3",
    ]);
    expect(
      page.quarantined.every((entry) =>
        /^[a-f0-9]{64}$/.test(entry.contentHash),
      ),
    ).toBe(true);
    expect(page.observations[0]?.provenance).toMatchObject({
      sourceId,
      ingestionRunId: runId,
      acquiredAt: observedAt,
      declaredPublication: null,
      observed: {
        kind: "date_period",
        startDate: "2026-09-30",
        endDate: "2026-10-02",
      },
    });
    expect(pollObservationSchema.safeParse(page.observations[0]).success).toBe(
      true,
    );
  });

  it("deduplicates identical IDs and quarantines conflicting versions in one response", async () => {
    const base = fixture[0] as Record<string, unknown>;
    const conflicting = { ...base, sample_size: 1500 };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify([base, { ...base }, conflicting])),
      );
    const adapter = createVoteHubGenericAdapter({
      budget,
      maxRecords: 3,
      httpDependencies: {
        fetch: fetchMock,
        now: () => Date.parse("2026-10-22T10:12:34.000Z"),
      },
    });
    const page = await adapter.fetchPage({
      cursor: null,
      signal: new AbortController().signal,
      sourceId,
      runId,
    });
    expect(page.observations).toHaveLength(0);
    expect(page.quarantined).toHaveLength(2);
    expect(page.quarantined.map((item) => item.reasonCode)).toEqual([
      "ambiguous_external_id",
      "ambiguous_external_id",
    ]);
  });

  it("quarantines fieldwork or provider creation dates beyond the next UTC calendar date", async () => {
    const base = fixture[0] as Record<string, unknown>;
    const futureFieldwork = {
      ...base,
      id: "future-fieldwork",
      end_date: "2026-10-24",
    };
    const futureCreated = {
      ...base,
      id: "future-created",
      created_at: "2026-10-24",
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify([futureFieldwork, futureCreated])),
      );
    const adapter = createVoteHubGenericAdapter({
      budget,
      maxRecords: 2,
      httpDependencies: {
        fetch: fetchMock,
        now: () => Date.parse("2026-10-22T23:30:00.000Z"),
      },
    });
    const page = await adapter.fetchPage({
      cursor: null,
      signal: new AbortController().signal,
      sourceId,
      runId,
    });
    expect(page.observations).toEqual([]);
    expect(page.quarantined.map((entry) => entry.reasonCode)).toEqual([
      "future_provider_dates",
      "future_provider_dates",
    ]);
  });
});
