import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { createBrowser } from "@/lib/files/browser";

function projectRoot(): string {
  return process.env.COCKPIT_PROJECT_ROOT ?? path.resolve(process.cwd(), "..");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const p = (body as { path?: unknown })?.path;
  if (typeof p !== "string" || !p) {
    return NextResponse.json({ error: "path_required" }, { status: 400 });
  }
  try {
    const browser = createBrowser(projectRoot());
    browser.mkdir(p);
    return NextResponse.json({ ok: true, path: p });
  } catch (err) {
    const reason = (err as Error).message;
    const status = reason.startsWith("sandbox_violation") ? 403 : 400;
    return NextResponse.json({ error: reason }, { status });
  }
}
