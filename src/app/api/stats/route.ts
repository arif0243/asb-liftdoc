import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/workspace-store";
import { readQuotationStore } from "@/lib/quotation-store";

export async function GET() {
  const [workspace, quotationStore] = await Promise.all([
    readWorkspace(),
    readQuotationStore(),
  ]);

  return NextResponse.json({
    clients: workspace.clients.filter((client) => client.status === "active").length,
    projects: workspace.projects.filter((project) => project.status !== "archived").length,
    quotations: quotationStore.quotations.length,
    invoices: 0,
  });
}
