"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";

const shellFreeRoutes = new Set(["/login"]);

export function AppShellRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (shellFreeRoutes.has(pathname)) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}