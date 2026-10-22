import { z } from "zod";
import {
  calendarDateSchema,
  editionScopeSchema,
  utcInstantSchema,
} from "../../platform/data/primitives";
import type { PollReadInput } from "../../platform/observatory/read-contracts";

export function validateRead(input: PollReadInput) {
  const scope = editionScopeSchema.parse(input.scope);
  const asOf = new Date(utcInstantSchema.parse(input.asOf));
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100
  )
    throw new Error("Observatory limit must be 1–100");
  if (
    !Number.isSafeInteger(input.staleAfterMinutes) ||
    input.staleAfterMinutes < 1 ||
    input.staleAfterMinutes > 100_000
  )
    throw new Error("Invalid observatory freshness threshold");
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000)
    throw new Error("Observatory offset must be 0–10,000");
  const raceId =
    input.raceId === undefined || input.raceId === null
      ? input.raceId
      : z.uuid().parse(input.raceId);
  const sourceId =
    input.sourceId === undefined ? undefined : z.uuid().parse(input.sourceId);
  const populationKind =
    input.populationKind === undefined
      ? undefined
      : z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(/^[a-z][a-z0-9_]*$/)
          .parse(input.populationKind);
  const fromDate =
    input.fromDate === undefined
      ? undefined
      : calendarDateSchema.parse(input.fromDate);
  const toDate =
    input.toDate === undefined
      ? undefined
      : calendarDateSchema.parse(input.toDate);
  if (fromDate && toDate && fromDate > toDate)
    throw new Error("Observatory date range is reversed");
  return {
    scope,
    asOf,
    raceId,
    sourceId,
    populationKind,
    fromDate,
    toDate,
    offset,
  };
}
