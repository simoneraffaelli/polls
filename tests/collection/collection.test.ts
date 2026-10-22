import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { pollObservationSchema } from "../../src/elections/polling/poll";
import { collectOnePage } from "../../src/platform/collection/collect-page";
import type {
  CollectionRun,
  SourcePage,
} from "../../src/platform/collection/contracts";
import { parseCsv } from "../../src/platform/collection/csv";
import { CollectionError } from "../../src/platform/collection/errors";
import {
  commitControlledImport,
  previewControlledImport,
  type ControlledImport,
} from "../../src/platform/collection/import-service";
import {
  createSourceHttpClient,
  type HttpBudget,
} from "../../src/infrastructure/http/source-client";

const run: CollectionRun = {
  sourceId: randomUUID(),
  runId: randomUUID(),
  cursorBefore: "page-1",
  cursorGenerationBefore: 4,
};
const acquiredAt = "2026-10-22T10:00:00.000Z";
const scope = {
  sectionId: "section:us:midterms",
  editionId: "edition:us:midterms:2026",
};
const destinations = [
  { scope, raceId: null },
  {
    scope: {
      sectionId: "section:it:midterms",
      editionId: "edition:it:midterms:2026",
    },
    raceId: null,
  },
];

const budget: HttpBudget = {
  maxPages: 1,
  maxRequests: 3,
  maxBytes: 100,
  maxResponseBytes: 80,
  maxDurationMs: 5_000,
  maxAttemptsPerGet: 3,
};

describe("one-page collection", () => {
  it("passes the persisted receipt to the adapter and commits the page once", async () => {
    const observation = {
      provenance: {
        sourceId: run.sourceId,
        ingestionRunId: run.runId,
        acquiredAt,
      },
    };
    const page: SourcePage<typeof observation> = {
      observations: [observation],
      quarantined: [],
      nextCursor: "page-2",
      hasMore: true,
      acquiredAt,
    };
    const fetchPage = vi.fn().mockResolvedValue(page);
    const commitPage = vi
      .fn()
      .mockResolvedValue({ saved: 1, repeated: false, quarantinedCount: 0 });
    const readCommittedPage = vi.fn().mockResolvedValue(null);
    const result = await collectOnePage({
      adapter: { family: "polls", parserVersion: "parser-1", fetchPage },
      store: { readCommittedPage, commitPage },
      run,
      destinations,
      signal: new AbortController().signal,
      maxObservationsPerPage: 10,
    });
    expect(fetchPage).toHaveBeenCalledWith({
      cursor: "page-1",
      sourceId: run.sourceId,
      runId: run.runId,
      signal: expect.any(AbortSignal),
    });
    expect(readCommittedPage).toHaveBeenCalledWith(run);
    expect(commitPage).toHaveBeenCalledWith({ run, page, destinations });
    expect(result).toEqual({
      saved: 1,
      repeated: false,
      quarantinedCount: 0,
      nextCursor: "page-2",
      hasMore: true,
    });
  });

  it("does not advance a repeated cursor or commit an oversized page", async () => {
    const commitPage = vi.fn();
    const observation = {
      provenance: {
        sourceId: run.sourceId,
        ingestionRunId: run.runId,
        acquiredAt,
      },
    };
    for (const page of [
      {
        observations: [observation],
        quarantined: [],
        nextCursor: "page-1",
        hasMore: true,
        acquiredAt,
      },
      {
        observations: [observation, observation],
        quarantined: [],
        nextCursor: null,
        hasMore: false,
        acquiredAt,
      },
    ]) {
      await expect(
        collectOnePage({
          adapter: {
            family: "polls",
            parserVersion: "parser-1",
            fetchPage: async () => page,
          },
          store: { readCommittedPage: async () => null, commitPage },
          run,
          destinations,
          signal: new AbortController().signal,
          maxObservationsPerPage: 1,
        }),
      ).rejects.toMatchObject({ code: "schema" });
    }
    expect(commitPage).not.toHaveBeenCalled();
  });

  it("rejects an observation stamped for another run", async () => {
    const commitPage = vi.fn();
    await expect(
      collectOnePage({
        adapter: {
          family: "polls",
          parserVersion: "parser-1",
          fetchPage: async () => ({
            observations: [
              {
                provenance: {
                  sourceId: run.sourceId,
                  ingestionRunId: randomUUID(),
                  acquiredAt,
                },
              },
            ],
            quarantined: [],
            nextCursor: null,
            hasMore: false,
            acquiredAt,
          }),
        },
        store: { readCommittedPage: async () => null, commitPage },
        run,
        destinations,
        signal: new AbortController().signal,
        maxObservationsPerPage: 10,
      }),
    ).rejects.toMatchObject({ code: "schema" });
    expect(commitPage).not.toHaveBeenCalled();
  });

  it("returns a committed receipt without fetching the provider after a lost acknowledgement", async () => {
    const fetchPage = vi.fn();
    const commitPage = vi.fn();
    const result = await collectOnePage({
      adapter: { family: "polls", parserVersion: "parser-1", fetchPage },
      store: {
        readCommittedPage: async () => ({
          saved: 3,
          repeated: true,
          quarantinedCount: 0,
          nextCursor: "page-2",
          hasMore: true,
        }),
        commitPage,
      },
      run,
      destinations,
      signal: new AbortController().signal,
      maxObservationsPerPage: 10,
    });
    expect(result).toMatchObject({ repeated: true, nextCursor: "page-2" });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(commitPage).not.toHaveBeenCalled();
  });
});

describe("bounded source HTTP", () => {
  it("refuses lookalike hosts, credentials, nonstandard ports and redirects without following them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://internal.invalid/" },
      }),
    );
    const page = createSourceHttpClient(budget, {
      fetch: fetchMock,
    }).beginPage();
    for (const url of [
      "http://api.votehub.com/polls",
      "https://api.votehub.com.evil.invalid/polls",
      "https://user:pass@api.votehub.com/polls",
      "https://api.votehub.com:8443/polls",
    ]) {
      await expect(
        page.get(url, new AbortController().signal),
      ).rejects.toMatchObject({ code: "unsafe_url" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      page.get("https://api.votehub.com/polls", new AbortController().signal),
    ).rejects.toMatchObject({ code: "unsafe_url" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        credentials: "omit",
      }),
    );
  });

  it("counts streamed bytes, pages and ordinary 4xx without retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("x".repeat(90)))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const client = createSourceHttpClient(budget, { fetch: fetchMock });
    const page = client.beginPage();
    await expect(
      page.get("https://api.votehub.com/polls", new AbortController().signal),
    ).rejects.toMatchObject({ code: "budget" });
    await expect(
      page.get("https://api.votehub.com/polls", new AbortController().signal),
    ).rejects.toMatchObject({ code: "http_status", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(() => client.beginPage()).toThrow(CollectionError);
  });

  it("caps streaming bodies even without Content-Length and times out during body reading", async () => {
    let cancelled = false;
    const oversized = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(50));
          controller.enqueue(new Uint8Array(50));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    const client = createSourceHttpClient(budget, {
      fetch: vi.fn().mockResolvedValue(oversized),
    });
    await expect(
      client
        .beginPage()
        .get("https://api.votehub.com/polls", new AbortController().signal),
    ).rejects.toMatchObject({ code: "budget" });
    expect(cancelled).toBe(true);

    const delayed = new Response(
      new ReadableStream({
        start(controller) {
          setTimeout(() => controller.enqueue(new Uint8Array([1])), 100);
        },
      }),
    );
    const timed = createSourceHttpClient(
      { ...budget, maxDurationMs: 20 },
      { fetch: vi.fn().mockResolvedValue(delayed) },
    );
    await expect(
      timed
        .beginPage()
        .get("https://api.votehub.com/polls", new AbortController().signal),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("respects Retry-After and defers when it exceeds the remaining time budget", async () => {
    let current = 0;
    const sleeps: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "1" } }),
      )
      .mockResolvedValueOnce(new Response("ok"));
    const client = createSourceHttpClient(budget, {
      fetch: fetchMock,
      now: () => current,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        current += milliseconds;
      },
    });
    const response = await client
      .beginPage()
      .get("https://api.votehub.com/polls", new AbortController().signal);
    expect(new TextDecoder().decode(response.body)).toBe("ok");
    expect(sleeps).toEqual([1_000]);
    expect(client.usage()).toMatchObject({ pages: 1, requests: 2, bytes: 2 });

    const slow = createSourceHttpClient(
      { ...budget, maxDurationMs: 2_000 },
      {
        fetch: vi.fn().mockResolvedValue(
          new Response(null, {
            status: 429,
            headers: { "Retry-After": "10" },
          }),
        ),
        now: () => 0,
        sleep: async () => {
          throw new Error("must not sleep");
        },
      },
    );
    await expect(
      slow
        .beginPage()
        .get("https://api.votehub.com/polls", new AbortController().signal),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 10_000 });
  });

  it("interrupts a retry sleep when the caller cancels", async () => {
    const controller = new AbortController();
    const client = createSourceHttpClient(budget, {
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 503, headers: { "Retry-After": "1" } }),
        ),
    });
    const pending = client
      .beginPage()
      .get("https://api.votehub.com/polls", controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });
});

function rawPoll(externalId: string, percentage: number) {
  return {
    provenance: {
      sourceId: randomUUID(),
      sourceUrl: "https://example.org/primary-poll",
      externalId,
      sourceRevision: null,
      observed: {
        kind: "date_period",
        startDate: "2026-10-01",
        endDate: "2026-10-03",
      },
      declaredPublication: { kind: "date", date: "2026-10-04" },
      acquiredAt: "2025-01-01T00:00:00.000Z",
      ingestionRunId: randomUUID(),
      parserVersion: "local-import-1",
      transformationVersion: "local-import-1",
      contentHash: "f".repeat(64),
    },
    pollster: "Named pollster",
    sponsors: ["Named sponsor"],
    questions: [
      {
        questionId: "generic-ballot",
        wording: null,
        kind: "generic_ballot",
        population: {
          kind: "registered_voters",
          description: "Registered voters",
        },
        sampleGroupId: "sample-a",
        sampleSize: 800,
        options: [{ optionId: "choice-a", label: "Choice A", percentage }],
      },
    ],
  };
}

const importLimits = {
  maxBytes: 20_000,
  maxRows: 5,
  maxColumns: 5,
  maxCellChars: 200,
  maxReportedErrors: 2,
};

describe("controlled local import", () => {
  it("parses quoted CSV and rejects malformed rows or duplicate headers", () => {
    expect(
      parseCsv(
        'id,label\r\n1,"one, two"\r\n2,"say ""hello"""\r\n',
        importLimits,
      ),
    ).toEqual([
      { id: "1", label: "one, two" },
      { id: "2", label: 'say "hello"' },
    ]);
    expect(() => parseCsv("id,id\n1,2", importLimits)).toThrow(CollectionError);
    expect(() => parseCsv('id,label\n1,"unfinished', importLimits)).toThrow(
      CollectionError,
    );
  });

  it("previews with the same validation as commit and stamps provenance from the persisted run", async () => {
    const importRun = { ...run, cursorBefore: null };
    const originalRaw = rawPoll("poll-one", 51);
    const input: ControlledImport<
      ReturnType<typeof pollObservationSchema.parse>
    > = {
      format: "json",
      content: JSON.stringify([originalRaw]),
      run: importRun,
      destinations,
      limits: importLimits,
      normalize: (row) => row,
      schema: pollObservationSchema,
      parserVersion: "controlled-import-1",
      transformationVersion: "mapping-1",
      now: () => new Date(acquiredAt),
    };
    expect(await previewControlledImport(input)).toMatchObject({
      runId: run.runId,
      totalRows: 1,
      validRows: 1,
      errors: [],
    });
    const commitPage = vi
      .fn()
      .mockResolvedValue({ saved: 1, repeated: false, quarantinedCount: 0 });
    expect(
      await commitControlledImport(input, {
        readCommittedPage: async () => null,
        commitPage,
      }),
    ).toEqual({
      runId: run.runId,
      saved: 1,
      repeated: false,
      quarantinedCount: 0,
    });
    const observation = commitPage.mock.calls[0][0].page.observations[0];
    expect(observation.provenance).toMatchObject({
      sourceId: run.sourceId,
      ingestionRunId: run.runId,
      acquiredAt,
    });
    expect(observation.provenance.contentHash).not.toBe("f".repeat(64));
    const spoofedRaw = rawPoll("poll-one", 51);
    spoofedRaw.provenance.acquiredAt = "2024-01-01T00:00:00.000Z";
    const nextCommit = vi
      .fn()
      .mockResolvedValue({ saved: 1, repeated: false, quarantinedCount: 0 });
    await commitControlledImport(
      {
        ...input,
        content: JSON.stringify([spoofedRaw]),
        run: { ...importRun, runId: randomUUID() },
        now: () => new Date("2026-10-23T10:00:00.000Z"),
      },
      { readCommittedPage: async () => null, commitPage: nextCommit },
    );
    expect(
      nextCommit.mock.calls[0][0].page.observations[0].provenance.contentHash,
    ).toBe(observation.provenance.contentHash);
  });

  it("reports only row/path codes and blocks a partially invalid batch", async () => {
    const input: ControlledImport<
      ReturnType<typeof pollObservationSchema.parse>
    > = {
      format: "json",
      content: JSON.stringify([
        rawPoll("good", 51),
        rawPoll("bad-secret", 151),
      ]),
      run,
      destinations,
      limits: importLimits,
      normalize: (row) => row,
      schema: pollObservationSchema,
      parserVersion: "controlled-import-1",
      transformationVersion: "mapping-1",
      now: () => new Date(acquiredAt),
    };
    const preview = await previewControlledImport(input);
    expect(preview).toMatchObject({
      totalRows: 2,
      validRows: 1,
      invalidRows: 1,
    });
    expect(preview.errors).toEqual([
      {
        row: 2,
        code: expect.any(String),
        path: expect.stringContaining("percentage"),
      },
    ]);
    expect(JSON.stringify(preview)).not.toContain("bad-secret");
    const commitPage = vi.fn();
    await expect(
      commitControlledImport(input, {
        readCommittedPage: async () => null,
        commitPage,
      }),
    ).rejects.toMatchObject({ code: "schema" });
    expect(commitPage).not.toHaveBeenCalled();
  });
});
