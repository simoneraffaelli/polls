import { createHash } from "node:crypto";
import type { PollObservation } from "../../elections/polling/poll";
import {
  createSourceHttpClient,
  type HttpBudget,
} from "../../infrastructure/http/source-client";
import type { SourceAdapter } from "../../platform/collection/contracts";
import { CollectionError } from "../../platform/collection/errors";
import { parseVoteHubPoll } from "./parser";

export const VOTEHUB_GENERIC_2026_URL =
  "https://api.votehub.com/polls?poll_type=generic-ballot&subject=2026&from_date=2026-10-01";
export const VOTEHUB_GENERIC_PARSER_VERSION = "votehub-generic-2026-v1";

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 32)
    throw new CollectionError(
      "schema",
      "Provider record exceeds nesting limit",
    );
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new CollectionError("schema", "Provider record is not JSON");
    return encoded;
  }
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(object[key], depth + 1)}`,
    )
    .join(",")}}`;
}

function hashRecord(record: unknown): string {
  return createHash("sha256").update(canonicalJson(record)).digest("hex");
}

function externalId(record: unknown): string | null {
  if (!record || typeof record !== "object" || Array.isArray(record))
    return null;
  const id = (record as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id : null;
}

/** The adapter is created for one job. It cannot fetch arbitrary URLs or race families. */
export function createVoteHubGenericAdapter(config: {
  budget: HttpBudget;
  maxRecords: number;
  httpDependencies?: Parameters<typeof createSourceHttpClient>[1];
}): SourceAdapter<PollObservation> {
  if (!Number.isSafeInteger(config.maxRecords) || config.maxRecords < 1)
    throw new CollectionError("budget", "Invalid VoteHub record limit");

  return {
    family: "polls",
    parserVersion: VOTEHUB_GENERIC_PARSER_VERSION,
    async fetchPage({ cursor, signal, sourceId, runId }) {
      if (cursor !== null)
        throw new CollectionError(
          "schema",
          "VoteHub generic feed has no cursor",
        );
      const client = createSourceHttpClient(
        config.budget,
        config.httpDependencies,
      );
      const response = await client
        .beginPage()
        .get(VOTEHUB_GENERIC_2026_URL, signal);
      let records: unknown;
      try {
        records = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(response.body),
        );
      } catch {
        throw new CollectionError("schema", "Invalid VoteHub JSON response");
      }
      if (!Array.isArray(records))
        throw new CollectionError("schema", "VoteHub response is not an array");
      if (records.length > config.maxRecords)
        throw new CollectionError(
          "budget",
          "VoteHub response exceeds record limit",
        );

      const observations: PollObservation[] = [];
      const quarantined: {
        externalId: string | null;
        contentHash: string;
        reasonCode: string;
      }[] = [];
      const hashesById = new Map<string, Set<string>>();
      for (const record of records) {
        const id = externalId(record);
        if (!id) continue;
        const hashes = hashesById.get(id) ?? new Set<string>();
        hashes.add(hashRecord(record));
        hashesById.set(id, hashes);
      }
      const seenExact = new Set<string>();
      for (const record of records) {
        const contentHash = hashRecord(record);
        const id = externalId(record);
        const exactKey = `${id ?? ""}:${contentHash}`;
        if (seenExact.has(exactKey)) continue;
        seenExact.add(exactKey);
        if (id && (hashesById.get(id)?.size ?? 0) > 1) {
          quarantined.push({
            externalId: id,
            contentHash,
            reasonCode: "ambiguous_external_id",
          });
          continue;
        }
        const parsed = parseVoteHubPoll(record);
        if (parsed.status === "quarantined") {
          quarantined.push({
            externalId: externalId(record),
            contentHash,
            reasonCode: parsed.reason,
          });
          continue;
        }
        const poll = parsed.poll;
        // Provider dates have no time of day; allow the following UTC date for clock boundaries.
        const latestPlausibleDate = new Date(
          Date.parse(response.receivedAt) + 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .slice(0, 10);
        if (
          poll.fieldworkEndDate > latestPlausibleDate ||
          poll.providerCreatedDate > latestPlausibleDate
        ) {
          quarantined.push({
            externalId: poll.externalId,
            contentHash,
            reasonCode: "future_provider_dates",
          });
          continue;
        }
        if (poll.subject !== "2026") {
          quarantined.push({
            externalId: poll.externalId,
            contentHash,
            reasonCode: "subject_mismatch",
          });
          continue;
        }
        observations.push({
          provenance: {
            sourceId,
            sourceUrl: poll.sourceUrl,
            externalId: poll.externalId,
            sourceRevision: null,
            observed: {
              kind: "date_period",
              startDate: poll.fieldworkStartDate,
              endDate: poll.fieldworkEndDate,
            },
            declaredPublication: null,
            acquiredAt: response.receivedAt,
            ingestionRunId: runId,
            parserVersion: VOTEHUB_GENERIC_PARSER_VERSION,
            transformationVersion: VOTEHUB_GENERIC_PARSER_VERSION,
            contentHash,
          },
          pollster: poll.pollster,
          sponsors: poll.sponsors,
          questions: [
            {
              questionId: "generic-ballot",
              wording: null,
              kind: "generic_ballot",
              population: poll.population,
              sampleGroupId: poll.sampleGroupId,
              sampleSize: poll.sampleSize,
              options: poll.options,
            },
          ],
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
