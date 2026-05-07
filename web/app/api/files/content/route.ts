import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { createBrowser } from "@/lib/files/browser";

function projectRoot(): string {
  return process.env.COCKPIT_PROJECT_ROOT ?? path.resolve(process.cwd(), "..");
}

export async function GET(req: NextRequest) {
  const rel = req.nextUrl.searchParams.get("path") ?? "";
  if (!rel) {
    return NextResponse.json({ error: "path_required" }, { status: 400 });
  }
  try {
    const browser = createBrowser(projectRoot());
    return NextResponse.json(browser.read(rel));
  } catch (err) {
    const reason = (err as Error).message;
    const status = reason.startsWith("sandbox_violation")
      ? 403
      : reason === "not_found"
        ? 404
        : 400;
    return NextResponse.json({ error: reason }, { status });
  }
}
