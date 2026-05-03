"use client";

import Link from "next/link";
import { useMemo } from "react";
import { setAuthIntent } from "@/lib/auth/authRoleIntent";
import { sanitizeCleanerPostAuthRedirect } from "@/lib/cleaner/cleanerRedirect";
import { cn } from "@/lib/utils";

function safeCustomerRedirect(raw: string | null | undefined): string {
  const fallback = "/dashboard/bookings";
  if (raw == null || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
  return t;
}

const TERMS_HREF = "mailto:hello@shaleancleaning.com?subject=Terms%20of%20service";
const PRIVACY_HREF = "mailto:hello@shaleancleaning.com?subject=Privacy%20policy";

export type AuthRoleChoiceScreenProps = {
  /** Safe in-app path after customer sign-in (e.g. from `?redirect=`). */
  redirect?: string | null;
  className?: string;
};

const choiceBtn =
  "flex w-full max-w-md items-center justify-center rounded-full px-5 py-4 text-center text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function AuthRoleChoiceScreen({ redirect, className }: AuthRoleChoiceScreenProps) {
  const customerNext = useMemo(() => safeCustomerRedirect(redirect), [redirect]);

  const customerLoginHref = useMemo(
    () => `/auth/login?redirect=${encodeURIComponent(customerNext)}&intent=customer`,
    [customerNext],
  );
  const customerSignupHref = useMemo(
    () => `/auth/signup?redirect=${encodeURIComponent(customerNext)}&intent=customer`,
    [customerNext],
  );

  const cleanerLoginHref = useMemo(() => {
    const raw = redirect?.trim();
    let base: string;
    if (raw && raw.startsWith("/cleaner")) {
      const safe = sanitizeCleanerPostAuthRedirect(raw);
      base = `/cleaner/login?redirect=${encodeURIComponent(safe)}`;
    } else {
      base = "/cleaner/login";
    }
    return base.includes("?") ? `${base}&intent=cleaner` : `${base}?intent=cleaner`;
  }, [redirect]);

  return (
    <div className={cn("flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950", className)}>
      <header className="border-b border-zinc-200/80 bg-white/80 px-6 py-5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <Link href="/" className="inline-flex flex-col gap-0.5 text-left transition hover:opacity-90">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Shalean</span>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Professional cleaning, simplified</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            What would you like to do?
          </h1>
          <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Book a clean as a customer, or open the cleaner app if you work with us.
          </p>

          <div className="mt-8 flex flex-col items-center">
            <Link
              href={customerLoginHref}
              onClick={() => setAuthIntent("customer")}
              className={cn(choiceBtn, "bg-primary text-primary-foreground shadow-primary/20 hover:bg-primary/90")}
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

          <div className="my-8 flex w-full max-w-md items-center gap-4">
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">or</span>
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          </div>

          <div className="flex flex-col items-center">
            <Link
              href={cleanerLoginHref}
              onClick={() => setAuthIntent("cleaner")}
              className={cn(
                choiceBtn,
                "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
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
        </div>
      </main>

      <footer className="px-6 py-6 text-center">
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          By continuing, you agree to our{" "}
          <a href={TERMS_HREF} className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href={PRIVACY_HREF} className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            Privacy Policy
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
