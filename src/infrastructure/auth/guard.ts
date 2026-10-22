import { eq, isNull, and } from "drizzle-orm";
import { ZodError } from "zod";
import { CollectionError } from "../../platform/collection/errors";
import { adminMemberships } from "../database/schema";
import { getAuthRuntime } from "./server";

export class AdminAccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
  }
}

export async function requireAdmin(request: Request) {
  let runtime: ReturnType<typeof getAuthRuntime>;
  try {
    runtime = getAuthRuntime();
  } catch {
    throw new AdminAccessError(503, "Administration is unavailable");
  }
  return authorizeAdmin(runtime, request);
}

export async function authorizeAdmin(
  runtime: ReturnType<typeof getAuthRuntime>,
  request: Request,
) {
  let current: Awaited<ReturnType<typeof runtime.auth.api.getSession>>;
  try {
    current = await runtime.auth.api.getSession({ headers: request.headers });
  } catch {
    throw new AdminAccessError(503, "Administration is unavailable");
  }
  if (!current?.user)
    throw new AdminAccessError(401, "Authentication required");
  const [member] = await runtime.db
    .select({ userId: adminMemberships.userId })
    .from(adminMemberships)
    .where(
      and(
        eq(adminMemberships.userId, current.user.id),
        isNull(adminMemberships.revokedAt),
      ),
    );
  if (!member) throw new AdminAccessError(403, "Administrator access required");
  return {
    userId: current.user.id,
    sessionId: current.session.id,
    db: runtime.db,
    origin: runtime.origin,
  };
}

export function assertAdminWriteRequest(
  request: Request,
  origin: string,
): void {
  const submittedOrigin = request.headers.get("origin");
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (submittedOrigin !== origin || contentType !== "application/json") {
    throw new AdminAccessError(403, "Request origin is not allowed");
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    throw new AdminAccessError(403, "Request origin is not allowed");
  }
}

export function adminErrorResponse(error: unknown): Response {
  const status =
    error instanceof AdminAccessError
      ? error.status
      : error instanceof ZodError
        ? 400
        : error instanceof CollectionError
          ? 409
          : 500;
  const message =
    error instanceof AdminAccessError
      ? error.message
      : error instanceof ZodError
        ? "Invalid request"
        : error instanceof CollectionError
          ? "The source or import is not available"
          : "Administration is unavailable";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
