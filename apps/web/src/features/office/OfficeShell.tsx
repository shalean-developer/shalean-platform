"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth/authClient";
import { RoleGuardRetryBanner, useRoleRouteGuard } from "@/lib/auth/useRoleRouteGuard";
import { getSupabaseBrowser, getSupabaseSession } from "@/lib/supabase/browser";
import { AdminToastHost } from "@/components/admin/AdminToastHost";
import {
  OfficeSidebarContent,
  OfficeTopBar,
  OfficeCommandPalette,
} from "./OfficeNav";

type Gate = "denied" | "ready";

function OfficeSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="h-16 animate-pulse border-b border-slate-200 bg-white" />
      <div className="flex flex-1">
        <div className="hidden w-44 animate-pulse bg-slate-100 md:block" />
        <div className="flex-1 space-y-4 p-6">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function DeniedGate({
  userLabel,
  errorMessage,
  redirectTarget,
  noSupabase,
  onRetry,
}: {
  userLabel: string;
  errorMessage: string | null;
  redirectTarget: string;
  noSupabase: boolean;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Admin access required</h1>
        {errorMessage ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
            <button
              type="button"
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
              onClick={onRetry}
            >
              Try again
            </button>
          </>
        ) : noSupabase ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">
            Missing{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> or{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> — check{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">.env.local</code>.
          </p>
        ) : userLabel ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{userLabel}</span> is not on the admin allowlist.
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Use a different account
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">Sign in with an allowlisted admin account to continue.</p>
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Login as Admin
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export function OfficeShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state: roleState, retry } = useRoleRouteGuard({ requiredRole: "admin" });
  const [gate, setGate] = useState<Gate>("ready");
  const [userLabel, setUserLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noSupabase, setNoSupabase] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    if (roleState.status !== "ready") return;
    if (!getSupabaseBrowser()) {
      setNoSupabase(true);
      setGate("denied");
      return;
    }
    void getSupabaseSession().then((session) => {
      const email = session?.user?.email?.trim();
      if (email) setUserLabel(email);
      setGate("ready");
      setErrorMessage(null);
      setNoSupabase(false);
    });
  }, [roleState.status]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setMobileOpen(false), 0);
    return () => globalThis.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (roleState.status === "unauthenticated" || roleState.status === "missing_profile") {
      setGate("denied");
    }
  }, [roleState.status]);

  // Realtime subscription — fires a custom window event when any booking changes
  useEffect(() => {
    if (gate !== "ready" || roleState.status !== "ready") return;
    const sb = getSupabaseBrowser();
    if (!sb) return;

    const channel = sb
      .channel("office:bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          window.dispatchEvent(new CustomEvent("office:booking-change"));
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [gate, roleState.status]);

  // Global Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  async function handleLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  if (roleState.status === "unauthenticated" || roleState.status === "missing_profile" || roleState.status === "wrong_role") {
    return null;
  }

  if (roleState.status === "checking") {
    return <OfficeSkeleton />;
  }

  if (roleState.status === "timeout") {
    return (
      <div className="min-h-screen bg-slate-50">
        <RoleGuardRetryBanner onRetry={retry} />
        <OfficeSkeleton />
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <DeniedGate
        userLabel={userLabel}
        errorMessage={errorMessage}
        redirectTarget={pathname || "/office"}
        noSupabase={noSupabase}
        onRetry={retry}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <OfficeTopBar
        userLabel={userLabel}
        onMenuOpen={() => setMobileOpen(true)}
        onLogout={() => void handleLogout()}
        onCommandPalette={() => setCommandOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-44 shrink-0 flex-col md:flex">
          <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
            <OfficeSidebarContent userLabel={userLabel} onLogout={() => void handleLogout()} />
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute left-0 top-16 h-[calc(100%-4rem)] w-[min(100%,18rem)] shadow-xl">
              <OfficeSidebarContent
                userLabel={userLabel}
                onLogout={() => void handleLogout()}
                onClose={() => setMobileOpen(false)}
              />
            </div>
          </div>
        ) : null}

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1600px] p-4 pb-8 md:p-6">{children}</div>
        </main>
      </div>

      <AdminToastHost />
      <OfficeCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
