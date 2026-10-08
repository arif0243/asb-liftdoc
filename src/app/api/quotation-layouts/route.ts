import { NextResponse } from "next/server";
import {
  getQuotationLayout,
  saveQuotationLayout,
} from "@/lib/quotation-layout-store";

export async function GET(request: Request) {
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