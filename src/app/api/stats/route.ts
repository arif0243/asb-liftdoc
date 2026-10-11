import { requireApiPermission } from "@/lib/auth/authz";
import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/workspace-store";
import { readQuotationStore } from "@/lib/quotation-store";

export async function GET() {
  // ASB_AUTH_GUARD_GET
  const authDenied = await requireApiPermission("dashboard.view");
  if (authDenied) return authDenied;
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
