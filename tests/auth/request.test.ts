import { describe, expect, it } from "vitest";
import { readLimitedJson } from "../../src/platform/admin/request";

describe("bounded administration payloads", () => {
  it("accepts UTF-8 JSON and rejects oversized streams without trusting Content-Length", async () => {
    const body = JSON.stringify({ reason: "correzione" });
    expect(
      await readLimitedJson(
        new Request("https://example.org", { method: "POST", body }),
        100,
      ),
    ).toEqual({ reason: "correzione" });
    await expect(
      readLimitedJson(
        new Request("https://example.org", { method: "POST", body }),
        4,
      ),
    ).rejects.toThrow("request_too_large");
  });
});
