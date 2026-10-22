/** pg returns bigint expressions in raw SQL rows as strings, independent of Drizzle column codecs. */
export function rawEpochMillis(value: unknown): Date | null {
  if (value === null) return null;
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    !/^-?\d+$/.test(String(value))
  )
    throw new Error("Invalid database epoch milliseconds");
  const millis = Number(value);
  if (!Number.isSafeInteger(millis))
    throw new Error("Database epoch milliseconds out of range");
  const date = new Date(millis);
  if (Number.isNaN(date.getTime()))
    throw new Error("Invalid database timestamp");
  return date;
}

export function requiredRawInstant(value: unknown): Date {
  const date = rawEpochMillis(value);
  if (!date) throw new Error("Required database timestamp is null");
  return date;
}
