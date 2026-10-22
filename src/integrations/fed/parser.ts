import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { CollectionError } from "../../platform/collection/errors";

export const FED_PRESS_FEED_URL =
  "https://www.federalreserve.gov/feeds/press_all.xml";
export const FED_PRESS_PARSER_VERSION = "fed-press-rss-v1";

type FeedItem = {
  externalId: string;
  title: string;
  url: string;
  publishedAt: string;
  contentHash: string;
};

type QuarantinedItem = {
  externalId: string | null;
  contentHash: string;
  reasonCode: string;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  processEntities: false,
  htmlEntities: false,
  trimValues: true,
  parseTagValue: false,
  cdataPropName: false,
});

function plainString(value: unknown): string | null {
  const text =
    typeof value === "string"
      ? value
          .replaceAll("&amp;", "&")
          .replaceAll("&quot;", '"')
          .replaceAll("&apos;", "'")
          .trim()
      : null;
  return text &&
    !/[<>]/.test(text) &&
    !/&(?:#|[A-Za-z][A-Za-z0-9]+;)/.test(text)
    ? text
    : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeArticleUrl(value: unknown): string | null {
  const raw = plainString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin === "https://www.federalreserve.gov" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function hashItem(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "null")
    .digest("hex");
}

function readFeedRecords(xml: string): unknown[] {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))
    throw new CollectionError(
      "schema",
      "RSS DTD or entity declaration rejected",
    );
  if (XMLValidator.validate(xml) !== true)
    throw new CollectionError("schema", "Invalid Federal Reserve RSS");
  let parsed: unknown;
  try {
    parsed = parser.parse(xml) as unknown;
  } catch {
    throw new CollectionError("schema", "Invalid Federal Reserve RSS");
  }
  const channel = asObject(asObject(parsed)?.rss)?.channel;
  const rawItems = asObject(channel)?.item;
  if (rawItems === undefined)
    throw new CollectionError("schema", "Federal Reserve RSS has no item list");
  return Array.isArray(rawItems) ? rawItems : [rawItems];
}

/** Treat RSS as untrusted data: reject DTD/entities and only retain known plain-text fields. */
export function parseFederalReservePressFeed(xml: string): {
  items: FeedItem[];
  quarantined: QuarantinedItem[];
} {
  const records = readFeedRecords(xml);
  const items: FeedItem[] = [];
  const quarantined: QuarantinedItem[] = [];
  for (const record of records) {
    const item = asObject(record);
    const contentHash = hashItem(record);
    const externalId = plainString(item?.guid) ?? null;
    const category = plainString(item?.category);
    if (!category) {
      quarantined.push({
        externalId,
        contentHash,
        reasonCode: "invalid_category",
      });
      continue;
    }
    // This feed also carries enforcement actions; only monetary policy is in scope.
    if (category !== "Monetary Policy") continue;
    const url = safeArticleUrl(item?.link);
    const title = plainString(item?.title);
    const date = plainString(item?.pubDate);
    const parsedDate = date ? Date.parse(date) : Number.NaN;
    if (
      !item ||
      !url ||
      !title ||
      !externalId ||
      !date ||
      !/\b(?:GMT|UTC)\s*$/.test(date) ||
      !Number.isFinite(parsedDate)
    ) {
      quarantined.push({
        externalId,
        contentHash,
        reasonCode: "invalid_or_unverified_item",
      });
      continue;
    }
    items.push({
      externalId,
      title,
      url,
      publishedAt: new Date(parsedDate).toISOString(),
      contentHash,
    });
  }
  return { items, quarantined };
}
