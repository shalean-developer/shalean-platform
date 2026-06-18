import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard, AuthLegalFooter } from "@/components/auth/AuthShell";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { AuthRoleChoicePageClient } from "./AuthRoleChoicePageClient";

export const metadata: Metadata = {
  title: "Sign in — Shalean",
  description: clampMetaDescription("Continue as a customer or cleaner."),
  robots: { index: false, follow: false },
};

export default function AuthEntryPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
        </AuthCard>
      }
    >
      <AuthRoleChoicePageClient />
      <AuthLegalFooter />
    </Suspense>
  );
}
