import { requireApiPermission } from "@/lib/auth/authz";
import { NextResponse } from "next/server";
import {
  createClient,
  readWorkspace,
  updateClient,
} from "@/lib/workspace-store";
export async function GET() {
  // ASB_AUTH_GUARD_GET
  const authDenied = await requireApiPermission("clients.view");
  if (authDenied) return authDenied;
  const data = await readWorkspace();
  return NextResponse.json({ clients: data.clients });
}

export async function POST(request: Request) {
  // ASB_AUTH_GUARD_POST
  const authDenied = await requireApiPermission("clients.manage");
  if (authDenied) return authDenied;
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
  // ASB_AUTH_GUARD_PUT
  const authDenied = await requireApiPermission("clients.manage");
  if (authDenied) return authDenied;
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

