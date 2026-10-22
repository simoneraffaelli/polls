import type { ArticleObservation } from "../../platform/data/article";
import type { SourceAdapter } from "../../platform/collection/contracts";
import { CollectionError } from "../../platform/collection/errors";
import {
  createSourceHttpClient,
  type HttpBudget,
} from "../../infrastructure/http/source-client";
import {
  FED_PRESS_FEED_URL,
  FED_PRESS_PARSER_VERSION,
  parseFederalReservePressFeed,
} from "./parser";

/** Fixed official feed; monetary-policy titles and links only. */
export function createFederalReservePressAdapter(config: {
  budget: HttpBudget;
  maxItems: number;
  httpDependencies?: Parameters<typeof createSourceHttpClient>[1];
}): SourceAdapter<ArticleObservation> {
  if (!Number.isSafeInteger(config.maxItems) || config.maxItems < 1)
    throw new CollectionError("budget", "Invalid Federal Reserve item limit");
  return {
    family: "articles",
    parserVersion: FED_PRESS_PARSER_VERSION,
    async fetchPage({ cursor, signal, sourceId, runId }) {
      if (cursor !== null)
        throw new CollectionError(
          "schema",
          "Federal Reserve RSS has no cursor",
        );
      const client = createSourceHttpClient(
        config.budget,
        config.httpDependencies,
      );
      const response = await client.beginPage().get(FED_PRESS_FEED_URL, signal);
      let feed: string;
      try {
        feed = new TextDecoder("utf-8", { fatal: true }).decode(response.body);
      } catch {
        throw new CollectionError(
          "schema",
          "Invalid Federal Reserve RSS encoding",
        );
      }
      const parsed = parseFederalReservePressFeed(feed);
      if (parsed.items.length + parsed.quarantined.length > config.maxItems)
        throw new CollectionError(
          "budget",
          "Federal Reserve RSS exceeds item limit",
        );
      const observations: ArticleObservation[] = [];
      const quarantined = [...parsed.quarantined];
      const hashesById = new Map<string, Set<string>>();
      for (const item of parsed.items) {
        const hashes = hashesById.get(item.externalId) ?? new Set<string>();
        hashes.add(item.contentHash);
        hashesById.set(item.externalId, hashes);
      }
      const seenExact = new Set<string>();
      for (const item of parsed.items) {
        const exactKey = `${item.externalId}:${item.contentHash}`;
        if (seenExact.has(exactKey)) continue;
        seenExact.add(exactKey);
        if ((hashesById.get(item.externalId)?.size ?? 0) > 1) {
          quarantined.push({
            externalId: item.externalId,
            contentHash: item.contentHash,
            reasonCode: "ambiguous_external_id",
          });
          continue;
        }
        if (Date.parse(item.publishedAt) > Date.parse(response.receivedAt)) {
          quarantined.push({
            externalId: item.externalId,
            contentHash: item.contentHash,
            reasonCode: "future_publication",
          });
          continue;
        }
        observations.push({
          provenance: {
            sourceId,
            sourceUrl: item.url,
            externalId: item.externalId,
            sourceRevision: null,
            observed: { kind: "instant", at: item.publishedAt },
            declaredPublication: { kind: "instant", at: item.publishedAt },
            acquiredAt: response.receivedAt,
            ingestionRunId: runId,
            parserVersion: FED_PRESS_PARSER_VERSION,
            transformationVersion: FED_PRESS_PARSER_VERSION,
            contentHash: item.contentHash,
          },
          publisher: "federal-reserve-board",
          title: item.title,
          url: item.url,
          excerpt: null,
          excerptReusePermitted: false,
        });
      }
      return {
        observations,
        quarantined,
        nextCursor: null,
        hasMore: false,
        acquiredAt: response.receivedAt,
      };
    },
  };
}
