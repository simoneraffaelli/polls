import { adminCommandSchema } from "@/platform/admin/commands";
import {
  applyAdminCommand,
  readAdminOverview,
} from "@/infrastructure/auth/admin-repository";
import {
  adminErrorResponse,
  assertAdminWriteRequest,
  requireAdmin,
} from "@/infrastructure/auth/guard";
import { configuredSources } from "@/infrastructure/database/schema";
import { eq } from "drizzle-orm";
import { readLimitedJson } from "@/platform/admin/request";
import {
  isKnownCollectibleSource,
  readCollectionSourceRegistry,
} from "@/composition/source-registry";
import { publishAdminCollectionRun } from "@/infrastructure/jobs/collection-queue";
import { readWorkerConfig } from "@/infrastructure/config/worker-env";
import { adminAudit } from "@/infrastructure/database/schema";
import { AdminAccessError } from "@/infrastructure/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const overview = await readAdminOverview(admin.db);
    return Response.json(overview, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    assertAdminWriteRequest(request, admin.origin);
    const raw = await readLimitedJson(request, 4096);
    const parsed = adminCommandSchema.safeParse(raw);
    if (!parsed.success)
      return Response.json({ error: "Invalid command" }, { status: 400 });
    if (parsed.data.action === "source.retry") {
      const active = await readCollectionSourceRegistry(admin.db);
      if (!active.has(parsed.data.sourceId))
        return Response.json(
          { error: "Source is not active for collection" },
          { status: 409 },
        );
      let connectionString: string;
      try {
        connectionString = readWorkerConfig(process.env).databaseUrl;
      } catch {
        throw new AdminAccessError(503, "Administration is unavailable");
      }
      await admin.db.insert(adminAudit).values({
        actorUserId: admin.userId,
        action: "source.retry_requested",
        targetType: "configured_source",
        targetId: parsed.data.sourceId,
        reason: parsed.data.reason,
      });
      const runId = await publishAdminCollectionRun(
        admin.db,
        connectionString,
        parsed.data.sourceId,
      );
      return Response.json(
        { runId },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      (parsed.data.action === "source.enabled" && parsed.data.enabled) ||
      (parsed.data.action === "binding.enabled" && parsed.data.enabled)
    ) {
      const [source] = await admin.db
        .select({ providerId: configuredSources.providerId })
        .from(configuredSources)
        .where(eq(configuredSources.id, parsed.data.sourceId));
      if (!source)
        return Response.json({ error: "Source not found" }, { status: 404 });
      if (
        source.providerId !== "provider:manual-import" &&
        !isKnownCollectibleSource(parsed.data.sourceId, source.providerId)
      )
        return Response.json(
          { error: "No collection adapter is active for this source" },
          { status: 409 },
        );
    }
    const updated = await applyAdminCommand(
      admin.db,
      admin.userId,
      parsed.data,
    );
    return Response.json(
      { updated },
      { status: updated ? 200 : 404, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large")
      return Response.json({ error: "Request is too large" }, { status: 413 });
    if (
      error instanceof Error &&
      (error.message === "invalid_json" || error.message === "request_timeout")
    )
      return Response.json({ error: "Invalid command" }, { status: 400 });
    return adminErrorResponse(error);
  }
}
