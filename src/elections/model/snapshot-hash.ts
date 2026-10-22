const maxDepth = 32;
const maxBytes = 5_000_000;

/** Stable JSON for a bounded, plain-data snapshot. */
function canonical(value: unknown, seen: Set<object>, depth: number): string {
  if (depth > maxDepth) throw new Error("Snapshot exceeds nesting budget");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (typeof value !== "object")
    throw new Error("Snapshot contains unsupported or non-finite value");
  if (seen.has(value)) throw new Error("Snapshot contains a cycle");
  seen.add(value);
  let encoded: string;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length)
      throw new Error("Snapshot contains a sparse or decorated array");
    encoded = `[${value.map((item) => canonical(item, seen, depth + 1)).join(",")}]`;
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      throw new Error("Snapshot must contain plain objects");
    encoded = `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], seen, depth + 1)}`,
      )
      .join(",")}}`;
  }
  seen.delete(value);
  if (encoded.length > maxBytes)
    throw new Error("Snapshot exceeds size budget");
  return encoded;
}

export async function snapshotDigest(snapshot: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(snapshot, new Set(), 0));
  if (bytes.byteLength > maxBytes)
    throw new Error("Snapshot exceeds size budget");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
