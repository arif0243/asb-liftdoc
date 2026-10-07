import { NextResponse } from "next/server";
import {
  createClient,
  readWorkspace,
  updateClient,
} from "@/lib/workspace-store";
export async function GET() {
  const data = await readWorkspace();
  return NextResponse.json({ clients: data.clients });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const client = await createClient(body);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create client." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Client id is required.");
    }

    const client = await updateClient(body);
    return NextResponse.json({ client });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update client." },
      { status: 400 },
    );
  }
}

