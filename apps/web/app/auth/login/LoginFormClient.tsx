"use client";

import dynamic from "next/dynamic";
import { AuthBackLink, AuthCard } from "@/components/auth/AuthShell";

const LoginForm = dynamic(() => import("./LoginForm").then((m) => m.LoginForm), {
  ssr: false,
  loading: () => (
    <>
      <AuthCard>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Welcome back</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Sign in to your Shalean account.</p>
        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </AuthCard>
      <AuthBackLink href="/auth">← Back to account selection</AuthBackLink>
    </>
  ),
});

export type LoginFormClientProps = {
  initialEmail?: string;
  stripCredentialsFromUrl?: boolean;
  redirect?: string;
  intent?: string | null;
};

export function LoginFormClient(props: LoginFormClientProps) {
  return <LoginForm {...props} />;
}
