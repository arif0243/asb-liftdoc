import { cookies } from "next/headers";
import type { PermissionKey } from "./permissions";
import { SESSION_COOKIE } from "./session";
import { authenticateToken } from "./request-auth";

export async function currentUserFromCookies() {
  const cookieStore = await cookies();
  return authenticateToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireApiPermission(
  permission: PermissionKey,
): Promise<Response | null> {
  const user = await currentUserFromCookies();

  if (!user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!user.permissions.includes(permission)) {
    return Response.json(
      { error: "You do not have permission for this action." },
      { status: 403 },
    );
  }

  return null;
}

export async function requireApiAdmin(): Promise<Response | null> {
  const user = await currentUserFromCookies();

  if (!user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (user.role !== "admin") {
    return Response.json(
      { error: "Administrator access is required." },
      { status: 403 },
    );
  }

  return null;
}