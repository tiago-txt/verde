import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Usado pelo healthcheck do Docker Compose. */
export async function GET() {
  try {
    getDb().select({ ok: sql<number>`1` }).from(users).limit(1).get();
    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        uptimeSeconds: Math.round(process.uptime()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[verde] healthcheck falhou:", error);
    return NextResponse.json(
      { status: "error", database: "error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
