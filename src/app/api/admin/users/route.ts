import { currentUserFromCookies, requireApiAdmin } from "@/lib/auth/authz";
import {
  createUser,
  listUsers,
  updateUser,
} from "@/lib/auth/user-store";

export async function GET() {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  const [users, currentUser] = await Promise.all([
    listUsers(),
    currentUserFromCookies(),
  ]);

  return Response.json({
    users,
    currentUserId: currentUser?.id ?? null,
  });
}

export async function POST(request: Request) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "user";
      status?: "active" | "disabled";
      permissions?: unknown;
    };

    const user = await createUser({
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      role: body.role,
      status: body.status,
      permissions: body.permissions,
    });

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create user.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const denied = await requireApiAdmin();
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "user";
      status?: "active" | "disabled";
      permissions?: unknown;
    };

    if (!body.id) {
      throw new Error("User id is required.");
    }

    const user = await updateUser(body.id, {
      name: body.name,
      email: body.email,
      password: body.password,
      role: body.role,
      status: body.status,
      permissions: body.permissions,
    });

    return Response.json({ user });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update user.",
      },
      { status: 400 },
    );
  }
}