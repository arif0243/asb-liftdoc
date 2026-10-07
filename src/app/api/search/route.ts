import { NextResponse } from "next/server";
import { searchWorkspace } from "@/lib/workspace-store";
import { searchQuotations } from "@/lib/quotation-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  const [workspaceResults, quotationResults] = await Promise.all([
    searchWorkspace(query),
    searchQuotations(query),
  ]);

  return NextResponse.json({
    results: [...workspaceResults, ...quotationResults].slice(0, 100),
  });
}
