import { toNextJsHandler } from "better-auth/next-js";
import { getAuthRuntime } from "@/infrastructure/auth/server";

export const dynamic = "force-dynamic";

function unavailable() {
  return Response.json(
    { error: "Authentication is unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  try {
    return await toNextJsHandler(getAuthRuntime().auth).GET(request);
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  try {
    return await toNextJsHandler(getAuthRuntime().auth).POST(request);
  } catch {
    return unavailable();
  }
}
