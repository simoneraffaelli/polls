import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createIsolatedDatabase, type IsolatedDatabase } from "./harness";
import { createAdminAuth } from "../../src/infrastructure/auth/server";
import {
  authorizeAdmin,
  AdminAccessError,
} from "../../src/infrastructure/auth/guard";
import {
  adminMemberships,
  session,
  user,
} from "../../src/infrastructure/database/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "administrator authentication on PostgreSQL",
  () => {
    let database: IsolatedDatabase;
    const config = {
      secret: "test-secret-is-long-enough-for-session-signing",
      baseURL: "http://localhost:3100",
    };
    beforeAll(async () => {
      database = await createIsolatedDatabase();
    });
    afterAll(async () => {
      await database?.cleanup();
    });

    it("rejects public signup and requires a live administrator membership and session", async () => {
      const provisioning = createAdminAuth(database.db, config, true);
      const server = createAdminAuth(database.db, config);
      const created = await provisioning.api.signUpEmail({
        body: {
          email: "admin@example.org",
          name: "Admin",
          password: "safe-password-for-test",
        },
      });
      expect(created.user.id).toBeTruthy();
      await expect(
        server.api.signUpEmail({
          body: {
            email: "visitor@example.org",
            name: "Visitor",
            password: "safe-password-for-test",
          },
        }),
      ).rejects.toThrow();
      expect(
        (
          await database.db
            .select()
            .from(user)
            .where(eq(user.email, "visitor@example.org"))
        ).length,
      ).toBe(0);

      const login = await server.handler(
        new Request(`${config.baseURL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            origin: config.baseURL,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: "admin@example.org",
            password: "safe-password-for-test",
          }),
        }),
      );
      expect(login.status).toBe(200);
      expect(
        login.headers
          .getSetCookie()
          .some((value) => /;\s*Secure(?:;|$)/i.test(value)),
      ).toBe(false);
      const cookies = login.headers
        .getSetCookie()
        .map((value) => value.split(";", 1)[0])
        .join("; ");
      expect(cookies).toContain("session_token");
      const request = new Request(`${config.baseURL}/api/admin`, {
        headers: { cookie: cookies },
      });
      const runtime = {
        auth: server,
        db: database.db,
        pool: database.pool,
        origin: config.baseURL,
      };
      await expect(authorizeAdmin(runtime, request)).rejects.toMatchObject({
        status: 403,
      } satisfies Partial<AdminAccessError>);
      await database.db
        .insert(adminMemberships)
        .values({ userId: created.user.id });
      const admin = await authorizeAdmin(runtime, request);
      expect(admin.userId).toBe(created.user.id);
      await database.db.delete(session).where(eq(session.id, admin.sessionId));
      await expect(authorizeAdmin(runtime, request)).rejects.toMatchObject({
        status: 401,
      } satisfies Partial<AdminAccessError>);
      const secureOrigin = "https://polls.example.org";
      const secureServer = createAdminAuth(database.db, {
        ...config,
        baseURL: secureOrigin,
      });
      const secureLogin = await secureServer.handler(
        new Request(`${secureOrigin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin: secureOrigin, "content-type": "application/json" },
          body: JSON.stringify({
            email: "admin@example.org",
            password: "safe-password-for-test",
          }),
        }),
      );
      expect(secureLogin.status).toBe(200);
      expect(
        secureLogin.headers
          .getSetCookie()
          .some((value) => /;\s*Secure(?:;|$)/i.test(value)),
      ).toBe(true);
    });
  },
);
