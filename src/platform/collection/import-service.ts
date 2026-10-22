import { z } from "zod";
import type { CollectionPageStore, CollectionRun } from "./contracts";
import { parseCsv } from "./csv";
import { CollectionError } from "./errors";

export interface ImportLimits {
  maxBytes: number;
  maxRows: number;
  maxColumns: number;
  maxCellChars: number;
  maxReportedErrors: number;
}

export interface ImportIssue {
  row: number;
  code: string;
  path: string;
}

export interface ImportPreview {
  runId: string;
  format: "csv" | "json";
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: readonly ImportIssue[];
}

export interface ControlledImport<T> {
  format: "csv" | "json";
  content: string;
  run: CollectionRun;
  destinations: readonly {
    scope: { sectionId: string; editionId: string };
    raceId: string | null;
  }[];
  limits: ImportLimits;
  /** Trusted local mapping; file fields never set collection identity or acquisition time. */
  normalize: (raw: unknown, row: number) => unknown | Promise<unknown>;
  schema: z.ZodType<T>;
  parserVersion: string;
  transformationVersion: string;
  now?: () => Date;
}

function assertLimits(limits: ImportLimits): void {
  if (
    Object.values(limits).some(
      (value) => !Number.isSafeInteger(value) || value < 1,
    )
  ) {
    throw new CollectionError("budget", "Invalid import limits");
  }
}

function rowsFrom(input: ControlledImport<unknown>): unknown[] {
  if (
    new TextEncoder().encode(input.content).byteLength > input.limits.maxBytes
  ) {
    throw new CollectionError("budget", "Import file exceeds byte limit");
  }
  if (input.format === "csv") return parseCsv(input.content, input.limits);
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.content);
  } catch {
    throw new CollectionError("schema", "Invalid JSON import");
  }
  if (!Array.isArray(parsed))
    throw new CollectionError("schema", "JSON import must be an array");
  if (parsed.length > input.limits.maxRows)
    throw new CollectionError("budget", "Import row limit exceeded");
  return parsed;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

async function hashRecord(record: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(record)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function prepare<T>(
  input: ControlledImport<T>,
): Promise<{ preview: ImportPreview; observations: T[]; acquiredAt: string }> {
  assertLimits(input.limits);
  const rows = rowsFrom(input);
  const instant = input.now?.() ?? new Date();
  if (Number.isNaN(instant.getTime()))
    throw new CollectionError("schema", "Invalid import acquisition clock");
  const acquiredAt = instant.toISOString();
  const observations: T[] = [];
  const errors: ImportIssue[] = [];
  let invalidRows = 0;
  for (const [index, raw] of rows.entries()) {
    let normalized: unknown;
    try {
      normalized = await input.normalize(raw, index + 1);
    } catch {
      invalidRows += 1;
      if (errors.length < input.limits.maxReportedErrors)
        errors.push({ row: index + 1, code: "mapping_error", path: "" });
      continue;
    }
    if (
      !normalized ||
      typeof normalized !== "object" ||
      Array.isArray(normalized) ||
      !("provenance" in normalized) ||
      !normalized.provenance ||
      typeof normalized.provenance !== "object" ||
      Array.isArray(normalized.provenance)
    ) {
      invalidRows += 1;
      if (errors.length < input.limits.maxReportedErrors)
        errors.push({
          row: index + 1,
          code: "provenance_missing",
          path: "provenance",
        });
      continue;
    }
    const candidate = {
      ...normalized,
      provenance: {
        ...normalized.provenance,
        sourceId: input.run.sourceId,
        ingestionRunId: input.run.runId,
        acquiredAt,
        parserVersion: input.parserVersion,
        transformationVersion: input.transformationVersion,
        contentHash: "0".repeat(64),
      },
    };
    const parsed = input.schema.safeParse(candidate);
    if (!parsed.success) {
      invalidRows += 1;
      if (errors.length < input.limits.maxReportedErrors) {
        const issue = parsed.error.issues[0];
        errors.push({
          row: index + 1,
          code: issue.code,
          path: issue.path.join("."),
        });
      }
      continue;
    }
    const normalizedObservation = parsed.data as Record<string, unknown> & {
      provenance: Record<string, unknown>;
    };
    const stableProvenance = { ...normalizedObservation.provenance };
    delete stableProvenance.sourceId;
    delete stableProvenance.ingestionRunId;
    delete stableProvenance.acquiredAt;
    delete stableProvenance.contentHash;
    const contentHash = await hashRecord({
      ...normalizedObservation,
      provenance: stableProvenance,
    });
    const completed = input.schema.parse({
      ...normalizedObservation,
      provenance: { ...normalizedObservation.provenance, contentHash },
    });
    observations.push(completed);
  }
  return {
    preview: {
      runId: input.run.runId,
      format: input.format,
      totalRows: rows.length,
      validRows: observations.length,
      invalidRows,
      errors,
    },
    observations,
    acquiredAt,
  };
}

/** Preview and commit call the same parser and schema; errors contain no source values. */
export async function previewControlledImport<T>(
  input: ControlledImport<T>,
): Promise<ImportPreview> {
  return (await prepare(input)).preview;
}

export async function commitControlledImport<T>(
  input: ControlledImport<T>,
  store: CollectionPageStore<T>,
) {
  const previous = await store.readCommittedPage(input.run);
  if (previous) return { runId: input.run.runId, ...previous };
  const { preview, observations, acquiredAt } = await prepare(input);
  if (preview.errors.length > 0)
    throw new CollectionError("schema", "Import contains invalid rows");
  const committed = await store.commitPage({
    run: input.run,
    destinations: input.destinations,
    page: {
      observations,
      quarantined: [],
      nextCursor: null,
      hasMore: false,
      acquiredAt,
    },
  });
  return { runId: input.run.runId, ...committed };
}
