import Link from "next/link";
import type { ReactNode } from "react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { cn } from "@/lib/utils";

const TERMS_HREF = "/terms-of-service";
const PRIVACY_HREF = "/privacy-policy";

export const AUTH_CARD_CLASS =
  "rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-md shadow-zinc-900/5 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(AUTH_CARD_CLASS, className)}>{children}</div>;
}

export function AuthLegalFooter() {
  return (
    <p className="mt-8 text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
      By continuing, you agree to our{" "}
      <Link
        href={TERMS_HREF}
        className="font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300"
      >
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link
        href={PRIVACY_HREF}
        className="font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300"
      >
        Privacy Policy
      </Link>
      .
    </p>
  );
}

export function AuthBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="mt-6 text-center">
      <Link href={href} className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
        {children}
      </Link>
    </p>
  );
}

/** Minimal full-screen auth chrome — no marketing header or footer. */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-100 px-4 py-10 sm:py-12 dark:bg-zinc-950">
      <div className="mb-8 flex w-full max-w-[440px] flex-col items-center text-center">
        <Link
          href="/"
          className="inline-flex flex-col items-center gap-2 transition hover:opacity-90"
          suppressHydrationWarning
        >
          <ShaleanNavLogo className="h-9 w-auto sm:h-10" intrinsicHeight={80} priority />
          <p className="text-sm text-zinc-500 dark:text-zinc-400" suppressHydrationWarning>
            Professional cleaning, simplified.
          </p>
        </Link>
      </div>

      <div className="w-full max-w-[440px]">{children}</div>
    </div>
  );
}
