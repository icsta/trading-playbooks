import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listSessions } from "@/lib/sessions/index";

export async function GET() {
  try {
    const rows = listSessions(getDb());
    return NextResponse.json({ sessions: rows });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "internal" },
      { status: 500 },
    );
  }
}
