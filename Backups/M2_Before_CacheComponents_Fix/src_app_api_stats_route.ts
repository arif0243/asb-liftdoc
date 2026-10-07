import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readWorkspace();

  return NextResponse.json({
    clients: data.clients.filter((client) => client.status === "active").length,
    projects: data.projects.filter((project) => project.status !== "archived").length,
    quotations: 0,
    invoices: 0,
  });
}
