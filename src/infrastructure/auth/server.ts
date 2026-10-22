import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { z } from "zod";
import { createDatabase } from "../database/client";
import * as schema from "../database/schema";
import { readWorkerConfig } from "../config/worker-env";

const authEnvironment = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

export function readAuthEnvironment(
  environment: Record<string, string | undefined>,
) {
  const parsed = authEnvironment.parse(environment);
  const origin = new URL(parsed.BETTER_AUTH_URL);
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      ))
  )
    throw new Error("Invalid admin authentication origin");
  return { secret: parsed.BETTER_AUTH_SECRET, baseURL: origin.origin };
}

type AuthRuntime = ReturnType<typeof createAuthRuntime>;
let runtime: AuthRuntime | undefined;

export function createAdminAuth(
  db: ReturnType<typeof createDatabase>["db"],
  config: { secret: string; baseURL: string },
  allowProvisioning = false,
) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowProvisioning,
      requireEmailVerification: false,
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    session: { cookieCache: { enabled: false }, expiresIn: 60 * 60 * 12 },
    trustedOrigins: [config.baseURL],
  });
}

function createAuthRuntime(allowProvisioning = false) {
  const config = readAuthEnvironment(process.env);
  const { db, pool } = createDatabase({
    connectionString: readWorkerConfig(process.env).databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
  const auth = createAdminAuth(db, config, allowProvisioning);
  return { auth, db, pool, origin: config.baseURL };
}

/** Deliberately lazy: public pages and build never require admin credentials. */
export function getAuthRuntime(): AuthRuntime {
  runtime ??= createAuthRuntime();
  return runtime;
}

/** Only the local CLI imports this factory. It is never exposed by a route. */
export function createProvisioningRuntime() {
  return createAuthRuntime(true);
}
