import { requireApiPermission } from "@/lib/auth/authz";
import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/workspace-store";
import {
  createQuotation,
  createRevision,
  duplicateQuotation,
  readQuotationStore,
  updateQuotation,
} from "@/lib/quotation-store";

export async function GET() {
  // ASB_AUTH_GUARD_GET
  const authDenied = await requireApiPermission("quotations.view");
  if (authDenied) return authDenied;
  const [quotationStore, workspace] = await Promise.all([
    readQuotationStore(),
    readWorkspace(),
  ]);

  return NextResponse.json({
    quotations: quotationStore.quotations,
    clients: workspace.clients,
    projects: workspace.projects,
  });
}

export async function POST(request: Request) {
  // ASB_AUTH_GUARD_POST
  const authDenied = await requireApiPermission("quotations.manage");
  if (authDenied) return authDenied;
  try {
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : "create";

    if (action === "duplicate") {
      if (!body?.sourceId) {
        throw new Error("Source quotation id is required.");
      }

      const quotation = await duplicateQuotation(body.sourceId);
      return NextResponse.json({ quotation }, { status: 201 });
    }

    if (action === "revision") {
      if (!body?.sourceId) {
        throw new Error("Source quotation id is required.");
      }

      const quotation = await createRevision(body.sourceId);
      return NextResponse.json({ quotation }, { status: 201 });
    }

    const quotation = await createQuotation(body);
    return NextResponse.json({ quotation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create quotation.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  // ASB_AUTH_GUARD_PUT
  const authDenied = await requireApiPermission("quotations.manage");
  if (authDenied) return authDenied;
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Quotation id is required.");
    }

    const quotation = await updateQuotation(body);
    return NextResponse.json({ quotation });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update quotation.",
      },
      { status: 400 },
    );
  }
}
