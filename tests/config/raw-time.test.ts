import { describe, expect, it } from "vitest";
import {
  rawEpochMillis,
  requiredRawInstant,
} from "../../src/infrastructure/database/raw-time";

describe("raw PostgreSQL timestamp decoding", () => {
  it("decodes bigint epoch strings and nullable values without relying on Date casts", () => {
    expect(requiredRawInstant("1792670400000").toISOString()).toBe(
      "2026-10-22T12:00:00.000Z",
    );
    expect(rawEpochMillis(null)).toBeNull();
    expect(() => requiredRawInstant("2026-10-22 12:00:00+00")).toThrow();
    expect(() => requiredRawInstant(null)).toThrow();
  });
});
