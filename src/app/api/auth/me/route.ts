import { currentUserFromCookies } from "@/lib/auth/authz";
import { toPublicUser } from "@/lib/auth/user-store";

export async function GET() {
  const user = await currentUserFromCookies();

  if (!user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  return Response.json({ user: toPublicUser(user) });
}