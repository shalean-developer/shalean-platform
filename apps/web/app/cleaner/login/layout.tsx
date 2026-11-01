import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildTransactionalPageMetadata } from "@/lib/seo/transactionalPageMetadata";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = buildTransactionalPageMetadata({
  path: "/cleaner/login",
  title: "Cleaner sign in — Shalean",
  description: "Sign in to your Shalean cleaner account to manage your assigned jobs and view your work details.",
});

export default function CleanerLoginLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
