import { Suspense } from "react";
import { CleanerLoginPageClient } from "./CleanerLoginPageClient";

function CleanerLoginFallback() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="mb-3 flex h-14 w-14 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    </div>
  );
}

export default function CleanerLoginPage() {
  return (
    <Suspense fallback={<CleanerLoginFallback />}>
      <CleanerLoginPageClient />
    </Suspense>
  );
}
