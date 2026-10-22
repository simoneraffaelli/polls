import { describe, expect, it } from "vitest";
import {
  assertAdminWriteRequest,
  AdminAccessError,
} from "../../src/infrastructure/auth/guard";
import { readAuthEnvironment } from "../../src/infrastructure/auth/server";

describe("administrator request boundaries", () => {
  const origin = "https://polls.example.org";
  it("requires an explicit secure origin and a strong secret", () => {
    expect(
      readAuthEnvironment({
        BETTER_AUTH_SECRET: "s".repeat(32),
        BETTER_AUTH_URL: origin,
      }),
    ).toEqual({ secret: "s".repeat(32), baseURL: origin });
    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_SECRET: "short",
        BETTER_AUTH_URL: origin,
      }),
    ).toThrow();
    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_SECRET: "s".repeat(32),
        BETTER_AUTH_URL: "http://example.org",
      }),
    ).toThrow();
    expect(() =>
      readAuthEnvironment({
        BETTER_AUTH_SECRET: "s".repeat(32),
        BETTER_AUTH_URL: "https://user:pass@example.org",
      }),
    ).toThrow();
  });

  it("rejects missing and foreign origins even for authenticated writes", () => {
    const request = (headers: Record<string, string>) =>
      new Request(`${origin}/api/admin`, {
        method: "POST",
        headers,
        body: "{}",
      });
    expect(() =>
      assertAdminWriteRequest(
        request({
          origin,
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        }),
        origin,
      ),
    ).not.toThrow();
    expect(() =>
      assertAdminWriteRequest(
        request({ "content-type": "application/json" }),
        origin,
      ),
    ).toThrow(AdminAccessError);
    expect(() =>
      assertAdminWriteRequest(
        request({
          origin: "https://evil.example",
          "content-type": "application/json",
        }),
        origin,
      ),
    ).toThrow(AdminAccessError);
    expect(() =>
      assertAdminWriteRequest(
        request({ origin, "content-type": "text/plain" }),
        origin,
      ),
    ).toThrow(AdminAccessError);
    expect(() =>
      assertAdminWriteRequest(
        request({
          origin,
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        }),
        origin,
      ),
    ).toThrow(AdminAccessError);
  });
});
