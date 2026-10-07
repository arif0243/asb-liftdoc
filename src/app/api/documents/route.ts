import { NextResponse } from "next/server";
import {
  createDocumentInstance,
  createDocumentVersion,
  duplicateDocumentInstance,
  readDocumentStore,
  updateDocumentInstance,
} from "@/lib/document-instance-store";
import { readQuotationStore } from "@/lib/quotation-store";
import { readTemplateStore } from "@/lib/template-store";
import { readWorkspace } from "@/lib/workspace-store";

export async function GET() {
  const [documentStore, quotationStore, templateStore, workspace] =
    await Promise.all([
      readDocumentStore(),
      readQuotationStore(),
      readTemplateStore(),
      readWorkspace(),
    ]);

  return NextResponse.json({
    documents: documentStore.documents,
    quotations: quotationStore.quotations,
    templates: templateStore.templates,
    clients: workspace.clients,
    projects: workspace.projects,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "create");

    if (action === "duplicate") {
      if (!body?.sourceId) {
        throw new Error("Source document id is required.");
      }

      const document = await duplicateDocumentInstance(body.sourceId);
      return NextResponse.json({ document }, { status: 201 });
    }

    if (action === "version") {
      if (!body?.sourceId) {
        throw new Error("Source document id is required.");
      }

      const document = await createDocumentVersion(body.sourceId);
      return NextResponse.json({ document }, { status: 201 });
    }

    const document = await createDocumentInstance({
      quotationId: String(body?.quotationId || ""),
      templateId: String(body?.templateId || ""),
      title: String(body?.title || ""),
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create document.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Document id is required.");
    }

    const document = await updateDocumentInstance(body);
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save document.",
      },
      { status: 400 },
    );
  }
}
