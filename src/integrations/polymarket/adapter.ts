import { createHash } from "node:crypto";
import {
  createSourceHttpClient,
  type HttpBudget,
} from "../../infrastructure/http/source-client";
import type { SourceAdapter } from "../../platform/collection/contracts";
import { CollectionError } from "../../platform/collection/errors";
import type { MarketQuoteObservation } from "../../platform/data/market";
import { MARKET_QUALITY_POLICY_VERSION, parsePolymarketBook } from "./book";

export const POLYMARKET_BOOK_PARSER_VERSION = "polymarket-book-v1";

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 32)
    throw new CollectionError("schema", "Provider book exceeds nesting limit");
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new CollectionError("schema", "Provider book is not JSON");
    return encoded;
  }
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry, depth + 1)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(object[key], depth + 1)}`,
    )
    .join(",")}}`;
}

/** A token-specific, read-only adapter. Registration remains disabled by default. */
export function createPolymarketBookAdapter(config: {
  budget: HttpBudget;
  marketId: string;
  assetId: string;
  outcomeId: string;
  timestampUnit: "seconds" | "milliseconds";
  collectionEnabled?: boolean;
  rightsVerified?: boolean;
  resolutionEquivalent?: boolean;
  timestampFormatVerified?: boolean;
  httpDependencies?: Parameters<typeof createSourceHttpClient>[1];
}): SourceAdapter<MarketQuoteObservation> {
  for (const identifier of [
    config.marketId,
    config.assetId,
    config.outcomeId,
  ]) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(identifier))
      throw new CollectionError(
        "schema",
        "Invalid configured market identifier",
      );
  }
  const url = `https://clob.polymarket.com/book?token_id=${encodeURIComponent(config.assetId)}`;
  return {
    family: "markets",
    parserVersion: POLYMARKET_BOOK_PARSER_VERSION,
    async fetchPage({ cursor, signal, sourceId, runId }) {
      if (
        config.collectionEnabled !== true ||
        config.rightsVerified !== true ||
        config.resolutionEquivalent !== true ||
        config.timestampFormatVerified !== true
      )
        throw new CollectionError(
          "schema",
          "Polymarket collection requires verified rights, resolution and timestamp format",
        );
      if (cursor !== null)
        throw new CollectionError("schema", "Polymarket book has no cursor");
      const client = createSourceHttpClient(
        config.budget,
        config.httpDependencies,
      );
      const response = await client.beginPage().get(url, signal);
      let raw: unknown;
      try {
        raw = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(response.body),
        );
      } catch {
        throw new CollectionError("schema", "Invalid Polymarket book JSON");
      }
      const contentHash = createHash("sha256")
        .update(canonicalJson(raw))
        .digest("hex");
      const parsed = parsePolymarketBook(raw, response.receivedAt, {
        marketId: config.marketId,
        assetId: config.assetId,
        timestampUnit: config.timestampUnit,
      });
      if (parsed.status === "quarantined")
        return {
          observations: [],
          quarantined: [
            {
              externalId: config.assetId,
              contentHash,
              reasonCode: parsed.reason,
            },
          ],
          nextCursor: null,
          hasMore: false,
          acquiredAt: response.receivedAt,
        };
      const observation: MarketQuoteObservation = {
        provenance: {
          sourceId,
          sourceUrl: url,
          externalId: config.assetId,
          sourceRevision: parsed.snapshotId,
          observed: { kind: "instant", at: parsed.observedAt },
          declaredPublication: null,
          acquiredAt: response.receivedAt,
          ingestionRunId: runId,
          parserVersion: POLYMARKET_BOOK_PARSER_VERSION,
          transformationVersion: POLYMARKET_BOOK_PARSER_VERSION,
          contentHash,
        },
        marketId: parsed.marketId,
        outcomeId: config.outcomeId,
        snapshotId: parsed.snapshotId,
        qualityPolicyVersion: MARKET_QUALITY_POLICY_VERSION,
        price: parsed.price,
      };
      return {
        observations: [observation],
        quarantined: [],
        nextCursor: null,
        hasMore: false,
        acquiredAt: response.receivedAt,
      };
    },
  };
}
