import { requireApiPermission } from "@/lib/auth/authz";
import { NextResponse } from "next/server";
import {
  getQuotationProposal,
  saveQuotationProposal,
} from "@/lib/quotation-proposal-store";

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

    const proposal =
      await getQuotationProposal(quotationId);

    return NextResponse.json({ proposal });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load proposal.",
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

    const proposal =
      await saveQuotationProposal(body);

    return NextResponse.json({ proposal });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save proposal.",
      },
      { status: 400 },
    );
  }
}