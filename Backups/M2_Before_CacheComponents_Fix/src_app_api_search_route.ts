import { NextResponse } from "next/server";
import { searchWorkspace } from "@/lib/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const results = await searchWorkspace(query);

  return NextResponse.json({ results });
}
