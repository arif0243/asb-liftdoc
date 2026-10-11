import { requireApiPermission } from "@/lib/auth/authz";
import { NextResponse } from "next/server";
import { readQuotationStore } from "@/lib/quotation-store";
import { readWorkspace } from "@/lib/workspace-store";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  readTemplateStore,
  saveReusableSection,
  updateTemplate,
} from "@/lib/template-store";

export async function GET() {
  // ASB_AUTH_GUARD_GET
  const authDenied = await requireApiPermission("templates.view");
  if (authDenied) return authDenied;
  const [templateStore, quotationStore, workspace] = await Promise.all([
    readTemplateStore(),
    readQuotationStore(),
    readWorkspace(),
  ]);

  return NextResponse.json({
    templates: templateStore.templates,
    sections: templateStore.sections,
    quotations: quotationStore.quotations,
    clients: workspace.clients,
    projects: workspace.projects,
  });
}

export async function POST(request: Request) {
  // ASB_AUTH_GUARD_POST
  const authDenied = await requireApiPermission("templates.manage");
  if (authDenied) return authDenied;
  try {
    const body = await request.json();
    const action = String(body?.action || "create");

    if (action === "duplicate") {
      if (!body?.id) {
        throw new Error("Template id is required.");
      }

      const template = await duplicateTemplate(body.id);
      return NextResponse.json({ template }, { status: 201 });
    }

    if (action === "save_section") {
      if (!body?.page) {
        throw new Error("Page data is required.");
      }

      const section = await saveReusableSection(
        String(body?.name || ""),
        body.page,
      );

      return NextResponse.json({ section }, { status: 201 });
    }

    const template = await createTemplate(String(body?.name || ""));
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create template.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  // ASB_AUTH_GUARD_PUT
  const authDenied = await requireApiPermission("templates.manage");
  if (authDenied) return authDenied;
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Template id is required.");
    }

    const template = await updateTemplate(body);
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save template.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  // ASB_AUTH_GUARD_DELETE
  const authDenied = await requireApiPermission("templates.manage");
  if (authDenied) return authDenied;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      throw new Error("Template id is required.");
    }

    await deleteTemplate(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to delete template.",
      },
      { status: 400 },
    );
  }
}
