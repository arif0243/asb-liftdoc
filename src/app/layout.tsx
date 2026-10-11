import { ShellEnhancements } from "@/components/auth/shell-enhancements";
import type { Metadata } from "next";
import "./globals.css";
import { AppShellRouter } from "@/components/auth/app-shell-router";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShellRouter>{children}</AppShellRouter>
              <ShellEnhancements />
      </body>
    </html>
  );
}
