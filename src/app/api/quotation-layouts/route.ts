import { requireApiPermission } from "@/lib/auth/authz";
import { NextResponse } from "next/server";
import {
  getQuotationLayout,
  saveQuotationLayout,
} from "@/lib/quotation-layout-store";

export async function GET(request: Request) {
  // ASB_AUTH_GUARD_GET
  const authDenied = await requireApiPermission("quotations.view");
  if (authDenied) return authDenied;
  try {
    const url = new URL(request.url);
    const quotationId =
      url.searchParams.get("quotationId") ?? "";

    if (!quotationId) {
      throw new Error("quotationId is required.");
    }

    const layout = await getQuotationLayout(quotationId);

    return NextResponse.json({ layout });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load quotation layout.",
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
    const layout = await saveQuotationLayout(body);

    return NextResponse.json({ layout });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save quotation layout.",
      },
      { status: 400 },
    );
  }
}