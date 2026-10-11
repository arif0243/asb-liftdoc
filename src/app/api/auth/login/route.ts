import { NextResponse } from "next/server";
import { getUserByEmail, recordSuccessfulLogin } from "@/lib/auth/user-store";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

type Attempt = {
  count: number;
  blockedUntil: number;
  lastAttemptAt: number;
};

const attempts = new Map<string, Attempt>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

function cleanExpiredAttempts() {
  const now = Date.now();
  for (const [key, value] of attempts) {
    if (now - value.lastAttemptAt > WINDOW_MS && value.blockedUntil < now) {
      attempts.delete(key);
    }
  }
}

export async function POST(request: Request) {
  cleanExpiredAttempts();

  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string; rememberMe?: boolean }
    | null;

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const key = `${requestIp(request)}|${email}`;
  const now = Date.now();
  const current = attempts.get(key);

  if (current && current.blockedUntil > now) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429 },
    );
  }

  const user = await getUserByEmail(email);
  const valid =
    user &&
    user.status === "active" &&
    verifyPassword(password, user.password);

  if (!valid) {
    const previous =
      current && now - current.lastAttemptAt <= WINDOW_MS
        ? current.count
        : 0;
    const count = previous + 1;

    attempts.set(key, {
      count,
      lastAttemptAt: now,
      blockedUntil: count >= MAX_FAILURES ? now + WINDOW_MS : 0,
    });

    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  attempts.delete(key);

  const token = createSessionToken({
    userId: user.id,
    sessionVersion: user.sessionVersion,
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    },
  });

  const cookieOptions = {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  if (body?.rememberMe === true) {
    response.cookies.set({
      ...cookieOptions,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  } else {
    response.cookies.set(cookieOptions);
  }

  await recordSuccessfulLogin(user.id);
  return response;
}