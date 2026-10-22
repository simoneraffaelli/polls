import { previewAdminPollImport } from "@/infrastructure/auth/admin-import";
import {
  adminErrorResponse,
  assertAdminWriteRequest,
  requireAdmin,
} from "@/infrastructure/auth/guard";
import { readLimitedJson } from "@/platform/admin/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    assertAdminWriteRequest(request, admin.origin);
    const body = await readLimitedJson(request, 1_100_000);
    const result = await previewAdminPollImport(admin.db, admin.userId, body);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large")
      return Response.json({ error: "File troppo grande" }, { status: 413 });
    if (
      error instanceof Error &&
      (error.message === "invalid_json" || error.message === "request_timeout")
    )
      return Response.json({ error: "Formato non valido" }, { status: 400 });
    return adminErrorResponse(error);
  }
}
