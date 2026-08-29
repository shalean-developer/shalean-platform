"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth/authClient";
import { RoleGuardRetryBanner, useRoleRouteGuard } from "@/lib/auth/useRoleRouteGuard";
import { getSupabaseBrowser, getSupabaseSession } from "@/lib/supabase/browser";
import { scheduleAppRouterPush, scheduleAppRouterRefresh } from "@/lib/navigation/scheduleAppRouterNavigation";
import { AdminToastHost } from "@/components/admin/AdminToastHost";
import { cn } from "@/lib/utils";
import {
  OfficeSidebarContent,
  OfficeTopBar,
  OfficeCommandPalette,
  useOfficeSidebarCollapsed,
} from "./OfficeNav";

type Gate = "denied" | "ready";

function OfficeSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="h-16 animate-pulse border-b border-border bg-card" />
      <div className="flex flex-1">
        <div className="hidden w-[220px] animate-pulse border-r border-border bg-[--sidebar-bg] md:block" />
        <div className="flex-1 space-y-[var(--ui-space-4)] bg-muted/20 p-[var(--ui-space-6)]">
          <div className="h-8 w-64 animate-pulse rounded-[var(--ui-radius-lg)] bg-muted" />
          <div className="h-40 animate-pulse rounded-[var(--ui-radius-2xl)] border border-border bg-card" />
          <div className="h-40 animate-pulse rounded-[var(--ui-radius-2xl)] border border-border bg-card" />
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
  const actionClass =
    "mt-5 inline-flex w-full items-center justify-center rounded-[var(--ui-radius-xl)] border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-[var(--ui-page-gutter)]">
      <div className="w-full max-w-md rounded-[var(--ui-radius-2xl)] border border-border bg-card p-[var(--ui-space-6)] text-center shadow-[var(--ui-shadow-sm)]">
        <h1 className="text-lg font-semibold text-foreground">Admin access required</h1>
        {errorMessage ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
            <button type="button" className={actionClass} onClick={onRetry}>
              Try again
            </button>
          </>
        ) : noSupabase ? (
          <p className="mt-2 text-sm text-warning-foreground">
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
            <Link href={`/login?redirect=${encodeURIComponent(redirectTarget)}`} className={actionClass}>
              Use a different account
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">Sign in with an allowlisted admin account to continue.</p>
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
              className="mt-5 inline-flex w-full items-center justify-center rounded-[var(--ui-radius-xl)] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
  const { state: roleState, retry } = useRoleRouteGuard({
    requiredRole: "admin",
    allowLocalhostDevBypass: true,
  });
  const [gate, setGate] = useState<Gate>("ready");
  const [userLabel, setUserLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noSupabase, setNoSupabase] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const { collapsed: sidebarCollapsed, toggleCollapsed: toggleSidebarCollapsed } = useOfficeSidebarCollapsed();

  useEffect(() => {
    if (roleState.status !== "ready") return;
    if (!getSupabaseBrowser()) {
      setNoSupabase(true);
      setGate("denied");
      return;
    }
    let active = true;
    void getSupabaseSession().then((session) => {
      if (!active) return;
      const email = session?.user?.email?.trim();
      if (email) setUserLabel(email);
      setGate("ready");
      setErrorMessage(null);
      setNoSupabase(false);
    });
    return () => {
      active = false;
    };
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
    scheduleAppRouterPush(router, "/");
    scheduleAppRouterRefresh(router);
  }

  if (roleState.status === "unauthenticated" || roleState.status === "missing_profile" || roleState.status === "wrong_role") {
    return null;
  }

  if (roleState.status === "checking") {
    return <OfficeSkeleton />;
  }

  if (roleState.status === "timeout") {
    return (
      <div className="min-h-screen bg-background">
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
    <div className="flex min-h-screen flex-col bg-background">
      <OfficeTopBar
        userLabel={userLabel}
        onMenuOpen={() => setMobileOpen(true)}
        onLogout={() => void handleLogout()}
        onCommandPalette={() => setCommandOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          ref={sidebarRef}
          className={cn(
            "relative z-[var(--ui-z-sticky)] hidden shrink-0 flex-col border-r border-[--sidebar-border] bg-[--sidebar-bg] shadow-[var(--ui-shadow-sm)] transition-[width] duration-200 md:flex",
            sidebarCollapsed ? "w-[72px]" : "w-[220px]",
          )}
        >
          <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-visible">
            <OfficeSidebarContent
              userLabel={userLabel}
              onLogout={() => void handleLogout()}
              collapsed={sidebarCollapsed}
              onToggleCollapsed={toggleSidebarCollapsed}
              showCollapseToggle
              sidebarRef={sidebarRef}
            />
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-[var(--ui-z-overlay)] md:hidden" role="dialog" aria-modal="true" aria-label="Office navigation">
            <button
              type="button"
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute left-0 top-16 h-[calc(100%-4rem)] w-[min(88vw,20rem)] border-r border-[--sidebar-border] bg-[--sidebar-bg] shadow-[var(--ui-shadow-xl)]">
              <OfficeSidebarContent
                userLabel={userLabel}
                onLogout={() => void handleLogout()}
                onClose={() => setMobileOpen(false)}
              />
            </div>
          </div>
        ) : null}

        {/* Main content */}
        <main className="min-w-0 flex-1 bg-muted/20">
          <div className="mx-auto w-full max-w-[1600px] px-[var(--ui-page-gutter)] py-[var(--ui-space-6)] pb-[var(--ui-space-8)]">{children}</div>
        </main>
      </div>

      <AdminToastHost />
      <OfficeCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
