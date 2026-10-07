import { NextResponse } from "next/server";
import { searchWorkspace } from "@/lib/workspace-store";
import { searchQuotations } from "@/lib/quotation-store";
import { searchDocuments } from "@/lib/document-instance-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  const [workspaceResults, quotationResults, documentResults] =
    await Promise.all([
      searchWorkspace(query),
      searchQuotations(query),
      searchDocuments(query),
    ]);

  return NextResponse.json({
    results: [
      ...workspaceResults,
      ...quotationResults,
      ...documentResults,
    ].slice(0, 120),
  });
}
