import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthShell";
import { CleanerLoginPageClient } from "./CleanerLoginPageClient";

function CleanerLoginFallback() {
  return (
    <AuthCard>
      <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Cleaner sign in</h1>
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    </AuthCard>
  );
}

export default function CleanerLoginPage() {
  return (
    <Suspense fallback={<CleanerLoginFallback />}>
      <CleanerLoginPageClient />
    </Suspense>
  );
}
