import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthRoleChoicePageClient } from "./AuthRoleChoicePageClient";

export const metadata: Metadata = {
  title: "Sign in — Shalean",
  description: "Continue as a customer or cleaner.",
  robots: { index: false, follow: false },
};

export default function AuthEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
        </div>
      }
    >
      <AuthRoleChoicePageClient />
    </Suspense>
  );
}
