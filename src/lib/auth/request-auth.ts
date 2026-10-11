import { getUserById, type AuthUser } from "./user-store";
import {
  SESSION_COOKIE,
  readCookieValue,
  verifySessionToken,
} from "./session";

export type AuthenticatedUser = AuthUser;

export async function authenticateToken(
  token: string | undefined | null,
): Promise<AuthenticatedUser | null> {
  const session = verifySessionToken(token);
  if (!session) return null;

  const user = await getUserById(session.uid);
  if (!user) return null;
  if (user.status !== "active") return null;
  if (user.sessionVersion !== session.ver) return null;

  return user;
}

export async function authenticateRequest(
  request: Request,
): Promise<AuthenticatedUser | null> {
  const token = readCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE,
  );
  return authenticateToken(token);
}