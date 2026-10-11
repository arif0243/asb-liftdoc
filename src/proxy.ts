import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateToken } from "@/lib/auth/request-auth";
import {
  SESSION_COOKIE,
  readCookieValue,
} from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/auth/permissions";

const publicApiPaths = new Set([
  "/api/auth/login",
]);

function pagePermission(pathname: string): PermissionKey | null {
  if (pathname === "/") return "dashboard.view";
  if (pathname.startsWith("/clients")) return "clients.view";
  if (pathname.startsWith("/projects")) return "projects.view";
  if (pathname.startsWith("/quotations")) return "quotations.view";
  if (pathname.startsWith("/documents")) return "documents.view";
  if (pathname.startsWith("/invoices")) return "invoices.view";
  if (pathname.startsWith("/templates")) return "templates.view";
  if (pathname.startsWith("/products")) return "products.view";
  if (pathname.startsWith("/archive")) return "archive.view";
  if (pathname.startsWith("/search")) return "search.view";
  return null;
}

function apiPermission(
  pathname: string,
  method: string,
): PermissionKey | null {
  const write = method !== "GET" && method !== "HEAD";

  if (pathname.startsWith("/api/clients")) {
    return write ? "clients.manage" : "clients.view";
  }
  if (pathname.startsWith("/api/projects")) {
    return write ? "projects.manage" : "projects.view";
  }
  if (
    pathname.startsWith("/api/quotations") ||
    pathname.startsWith("/api/quotation-proposals") ||
    pathname.startsWith("/api/quotation-layouts")
  ) {
    return write ? "quotations.manage" : "quotations.view";
  }
  if (pathname.startsWith("/api/documents")) {
    return write ? "documents.manage" : "documents.view";
  }
  if (pathname.startsWith("/api/invoices")) {
    return write ? "invoices.manage" : "invoices.view";
  }
  if (pathname.startsWith("/api/templates")) {
    return write ? "templates.manage" : "templates.view";
  }
  if (pathname.startsWith("/api/search")) return "search.view";
  if (pathname.startsWith("/api/stats")) return "dashboard.view";
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicApiPaths.has(pathname)) {
    return NextResponse.next();
  }

  const token = readCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE,
  );
  const user = await authenticateToken(token);

  if (pathname === "/login") {
    return user
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const login = new URL("/login", request.url);
    login.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(login);
  }

  if (
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/me" ||
    pathname === "/forbidden"
  ) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/settings") ||
    pathname.startsWith("/api/admin/users")
  ) {
    if (user.role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Administrator access is required." },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
    return NextResponse.next();
  }

  const required = pathname.startsWith("/api/")
    ? apiPermission(pathname, request.method)
    : pagePermission(pathname);

  if (required && !user.permissions.includes(required)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "You do not have permission for this action." },
        { status: 403 },
      );
    }

    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};