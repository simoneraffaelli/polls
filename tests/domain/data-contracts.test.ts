import { describe, expect, it } from "vitest";
import { articleObservationSchema } from "../../src/platform/data/article";
import { marketQuoteObservationSchema } from "../../src/platform/data/market";
import {
  observationProvenanceSchema,
  revisionIdentitySchema,
} from "../../src/platform/data/provenance";
import { pollObservationSchema } from "../../src/elections/polling/poll";

const uuid = {
  source: "11111111-1111-4111-8111-111111111111",
  ingestion: "22222222-2222-4222-8222-222222222222",
  entity: "33333333-3333-4333-8333-333333333333",
  revision: "44444444-4444-4444-8444-444444444444",
};

const provenance = {
  sourceId: uuid.source,
  sourceUrl: "https://example.org/polls/42",
  externalId: "source-record-42",
  sourceRevision: null,
  observed: {
    kind: "date_period",
    startDate: "2026-10-10",
    endDate: "2026-10-12",
  },
  declaredPublication: { kind: "instant", at: "2026-10-13T10:00:00Z" },
  acquiredAt: "2026-10-13T11:00:00Z",
  ingestionRunId: uuid.ingestion,
  parserVersion: "poll-parser-1",
  transformationVersion: "normalizer-1",
  contentHash: "a".repeat(64),
};

describe("normalized data contracts", () => {
  it("keeps observed calendar dates distinct from publication and acquisition instants", () => {
    const parsed = observationProvenanceSchema.parse(provenance);
    expect(parsed.observed).toEqual({
      kind: "date_period",
      startDate: "2026-10-10",
      endDate: "2026-10-12",
    });
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        observed: {
          kind: "date_period",
          startDate: "2026-02-30",
          endDate: "2026-03-01",
        },
      }).success,
    ).toBe(false);
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        observed: {
          kind: "date_period",
          startDate: "2026-10-12",
          endDate: "2026-10-10",
        },
      }).success,
    ).toBe(false);
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        acquiredAt: "2026-10-13",
      }).success,
    ).toBe(false);
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        declaredPublication: {
          kind: "instant",
          at: "2026-10-13T11:00:00.500Z",
        },
      }).success,
    ).toBe(false);
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        declaredPublication: { kind: "date", date: "2026-10-13" },
      }).success,
    ).toBe(true);
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        declaredPublication: { kind: "date", date: "2026-10-14" },
      }).success,
    ).toBe(true);
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        sourceUrl: "file:///private/payload",
      }).success,
    ).toBe(false);
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        sourceUrl: "not a url",
      }).success,
    ).toBe(false);
    expect(
      observationProvenanceSchema.safeParse({
        ...provenance,
        sourceUrl: "https://token@example.org/polls/42",
      }).success,
    ).toBe(false);
  });

  it("preserves a new revision identity without allowing self-supersession", () => {
    expect(
      revisionIdentitySchema.parse({
        entityId: uuid.entity,
        revisionId: uuid.revision,
        supersedesRevisionId: null,
      }).revisionId,
    ).toBe(uuid.revision);
    expect(
      revisionIdentitySchema.safeParse({
        entityId: uuid.entity,
        revisionId: uuid.revision,
        supersedesRevisionId: uuid.revision,
      }).success,
    ).toBe(false);
  });

  it("retains shared sample identity across registered and likely voter questions", () => {
    const question = {
      questionId: "generic-ballot-rv",
      wording: "Per quale candidato voteresti?",
      kind: "generic_ballot",
      population: {
        kind: "registered_voters",
        description: "Elettori registrati",
      },
      sampleGroupId: "study-42-main-sample",
      sampleSize: 1000,
      options: [
        { optionId: "candidate-a", label: "Candidato A", percentage: 48.5 },
      ],
    };
    const poll = {
      provenance,
      pollster: "Istituto",
      sponsors: ["Committente A", "Committente B"],
      questions: [
        question,
        {
          ...question,
          questionId: "generic-ballot-lv",
          population: {
            kind: "likely_voters",
            description: "Elettori probabili",
          },
          sampleSize: 700,
        },
      ],
    };
    const parsed = pollObservationSchema.parse(poll);
    expect(parsed.questions.map(({ sampleGroupId }) => sampleGroupId)).toEqual([
      "study-42-main-sample",
      "study-42-main-sample",
    ]);
    expect(
      pollObservationSchema.safeParse({
        ...poll,
        questions: [{ ...question, wording: null }],
      }).success,
    ).toBe(true);
    expect(
      pollObservationSchema.safeParse({
        ...poll,
        questions: [
          {
            ...question,
            options: [{ ...question.options[0], percentage: 1.01 * 100 }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      pollObservationSchema.safeParse({
        ...poll,
        questions: [{ ...question, sampleSize: 0 }],
      }).success,
    ).toBe(false);
  });

  it("keeps midpoint, last trade and unavailable quotes distinct", () => {
    const base = {
      provenance: {
        ...provenance,
        observed: { kind: "instant", at: "2026-10-13T10:59:00Z" },
      },
      marketId: "market-1",
      outcomeId: "yes",
      snapshotId: "snap-1",
      qualityPolicyVersion: "quality-1",
    };
    const midpoint = {
      kind: "bid_ask_midpoint",
      bid: 0.44,
      ask: 0.46,
      midpoint: 0.45,
      spread: 0.02,
      comparisonStatus: "eligible",
      exclusionReason: null,
    };
    expect(
      marketQuoteObservationSchema.parse({ ...base, price: midpoint }).price
        .kind,
    ).toBe("bid_ask_midpoint");
    expect(
      marketQuoteObservationSchema.safeParse({
        ...base,
        price: { ...midpoint, midpoint: 0.46 },
      }).success,
    ).toBe(false);
    expect(
      marketQuoteObservationSchema.safeParse({
        ...base,
        price: { ...midpoint, ask: 0.43 },
      }).success,
    ).toBe(false);
    expect(
      marketQuoteObservationSchema.parse({
        ...base,
        price: { kind: "last_trade", price: 0.52 },
      }).price.kind,
    ).toBe("last_trade");
    expect(
      marketQuoteObservationSchema.parse({
        ...base,
        price: {
          kind: "unavailable",
          expectedPriceType: "bid_ask_midpoint",
          reason: "missing_bid_or_ask",
          bid: 0.44,
          ask: null,
        },
      }).price.kind,
    ).toBe("unavailable");
    expect(
      marketQuoteObservationSchema.safeParse({
        ...base,
        price: { kind: "last_trade", price: 52 },
      }).success,
    ).toBe(false);
  });

  it("rejects unauthorized excerpts and HTML in article metadata", () => {
    const article = {
      provenance: {
        ...provenance,
        observed: { kind: "instant", at: "2026-10-13T10:00:00Z" },
      },
      publisher: "Editore",
      title: "Titolo",
      url: "https://example.org/story",
      excerpt: null,
      excerptReusePermitted: false,
    };
    expect(articleObservationSchema.safeParse(article).success).toBe(true);
    expect(
      articleObservationSchema.safeParse({ ...article, excerpt: "Estratto" })
        .success,
    ).toBe(false);
    expect(
      articleObservationSchema.safeParse({
        ...article,
        title: "<script>alert(1)</script>",
      }).success,
    ).toBe(false);
    expect(
      articleObservationSchema.safeParse({ ...article, url: "not a url" })
        .success,
    ).toBe(false);
    expect(
      articleObservationSchema.safeParse({
        ...article,
        url: "https://token@example.org/story",
      }).success,
    ).toBe(false);
  });
});
