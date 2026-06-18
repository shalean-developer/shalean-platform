"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AuthCard } from "@/components/auth/AuthShell";
import { setAuthIntent } from "@/lib/auth/authRoleIntent";
import { cn } from "@/lib/utils";

function safeCustomerRedirect(raw: string | null | undefined): string {
  const fallback = "/account";
  if (raw == null || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
  return t;
}

function safeCleanerRedirect(raw: string | null | undefined): string {
  const fallback = "/jobs";
  if (raw == null || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
  if (t.startsWith("/jobs")) return t;
  return fallback;
}

export type AuthRoleChoiceScreenProps = {
  /** Safe in-app path after customer sign-in (e.g. from `?redirect=`). */
  redirect?: string | null;
  className?: string;
};

const primaryBtn =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function AuthRoleChoiceScreen({ redirect, className }: AuthRoleChoiceScreenProps) {
  const customerNext = useMemo(() => safeCustomerRedirect(redirect), [redirect]);
  const cleanerNext = useMemo(() => safeCleanerRedirect(redirect), [redirect]);

  const customerLoginHref = useMemo(
    () => `/auth/login?redirect=${encodeURIComponent(customerNext)}&intent=customer`,
    [customerNext],
  );
  const customerSignupHref = useMemo(
    () => `/auth/signup?redirect=${encodeURIComponent(customerNext)}&intent=customer`,
    [customerNext],
  );
  const cleanerLoginHref = useMemo(
    () => `/cleaner/login?redirect=${encodeURIComponent(cleanerNext)}`,
    [cleanerNext],
  );

  return (
    <AuthCard className={cn(className)}>
      <h1 className="text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        What would you like to do?
      </h1>
      <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">Choose how you want to continue.</p>

      <div className="mt-8">
        <Link
          href={customerLoginHref}
          onClick={() => setAuthIntent("customer")}
          className={cn(primaryBtn, "bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          Continue as customer
        </Link>
        <p className="mt-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
          New here?{" "}
          <Link
            href={customerSignupHref}
            onClick={() => setAuthIntent("customer")}
            className="font-semibold text-primary hover:underline"
          >
            Create account
          </Link>
        </p>
      </div>

      <div className="my-8 flex items-center gap-3" aria-hidden>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">OR</span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
      </div>

      <div>
        <Link
          href={cleanerLoginHref}
          onClick={() => setAuthIntent("cleaner")}
          className={cn(
            primaryBtn,
            "bg-[#0d1b69] text-white hover:bg-[#0a1657] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
          )}
        >
          Continue as cleaner
        </Link>
        <p className="mt-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Want to work with us?{" "}
          <Link
            href="/cleaner/apply"
            onClick={() => setAuthIntent("cleaner")}
            className="font-semibold text-primary hover:underline"
          >
            Apply as a cleaner
          </Link>
        </p>
      </div>

      <p className="mt-8 text-center">
        <Link
          href="/auth/admin"
          className="text-xs font-medium text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Admin login
        </Link>
      </p>
    </AuthCard>
  );
}
