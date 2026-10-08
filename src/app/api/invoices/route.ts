import { NextResponse } from "next/server";
import {
  createInvoice,
  duplicateInvoice,
  readInvoiceStore,
  updateInvoice,
} from "@/lib/invoice-store";
import { readQuotationStore } from "@/lib/quotation-store";
import { readWorkspace } from "@/lib/workspace-store";

export async function GET() {
  const [invoiceStore, quotationStore, workspace] =
    await Promise.all([
      readInvoiceStore(),
      readQuotationStore(),
      readWorkspace(),
    ]);

  return NextResponse.json({
    invoices: invoiceStore.invoices,
    quotations: quotationStore.quotations,
    clients: workspace.clients,
    projects: workspace.projects,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const invoice =
      body?.action === "duplicate"
        ? await duplicateInvoice(String(body?.sourceId || ""))
        : await createInvoice(body);

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create invoice.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) throw new Error("Invoice id is required.");

    const invoice = await updateInvoice(body);
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save invoice.",
      },
      { status: 400 },
    );
  }
}
