import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/AuthShell";
import { parseLoginSearchParams } from "@/lib/auth/sanitizeLoginSearchParams";

import { LoginForm } from "./LoginForm";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const parsed = parseLoginSearchParams(params);

  if (parsed.hasPasswordInQuery) {
    redirect(`/auth/login${parsed.safeSearch}`);
  }

  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-zinc-500">Loading…</p>
        </AuthCard>
      }
    >
      <LoginForm
        initialEmail={parsed.emailPrefill ?? ""}
        stripCredentialsFromUrl={parsed.shouldStripCredentialsFromUrl}
      />
    </Suspense>
  );
}
