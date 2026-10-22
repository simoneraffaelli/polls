import { sql } from "drizzle-orm";
import { getRuntimeDatabase } from "@/infrastructure/database/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getRuntimeDatabase();
    if (!database) throw new Error("Database not configured");
    // Verifies a usable application schema, not merely an open TCP port.
    await database.db.execute(sql`select id from configured_sources limit 1`);
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
