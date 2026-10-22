import {
  AdminPollConflict,
  applyAdminPollCommand,
  readAdminPollLinks,
} from "@/infrastructure/auth/admin-poll-repository";
import {
  adminErrorResponse,
  assertAdminWriteRequest,
  requireAdmin,
} from "@/infrastructure/auth/guard";
import { readLimitedJson } from "@/platform/admin/request";
import { adminPollCommandSchema } from "@/platform/admin/poll-commands";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const rawOffset = new URL(request.url).searchParams.get("offset") ?? "0";
    if (!/^\d{1,5}$/.test(rawOffset))
      return Response.json({ error: "Invalid page" }, { status: 400 });
    return Response.json(
      await readAdminPollLinks(admin.db, Number(rawOffset)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AdminPollConflict)
      return Response.json(
        { error: error.message },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    assertAdminWriteRequest(request, admin.origin);
    const command = adminPollCommandSchema.parse(
      await readLimitedJson(request, 4096),
    );
    const result = await applyAdminPollCommand(admin.db, admin.userId, command);
    return Response.json(result ?? { error: "Poll or destination not found" }, {
      status: result ? 200 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large")
      return Response.json({ error: "Request is too large" }, { status: 413 });
    return adminErrorResponse(error);
  }
}
