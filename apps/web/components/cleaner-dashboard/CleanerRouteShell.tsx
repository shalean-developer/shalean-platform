"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "@/lib/auth/authClient";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { CleanerBottomNav } from "./CleanerBottomNav";
import { CleanerNavBadgesProvider } from "./CleanerNavBadgesContext";
import { CleanerNotificationsProvider } from "@/lib/notifications/notificationsStore";

const PUBLIC_PREFIXES = ["/cleaner/login", "/cleaner/apply"] as const;

function isPublicCleanerPath(pathname: string | null) {
  if (!pathname) return false;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function AccessGatePlaceholder({
  title,
  description,
  slowHintAfterMs = 5000,
}: {
  title: string;
  description: string;
  slowHintAfterMs?: number;
}) {
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setShowSlowHint(true), slowHintAfterMs);
    return () => window.clearTimeout(t);
  }, [slowHintAfterMs]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <p className="text-xl font-semibold tracking-tight text-foreground">Shalean</p>

        <div
          className="size-10 shrink-0 rounded-full border-[3px] border-muted border-t-foreground motion-safe:animate-spin"
          aria-hidden
        />

        <div className="space-y-2">
          <p className="text-lg font-medium text-foreground">{title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>

        {showSlowHint ? (
          <p className="text-xs leading-snug text-muted-foreground">
            Taking longer than expected — check your connection or try again shortly.
          </p>
        ) : (
          <div className="h-4" aria-hidden />
        )}
      </div>
    </main>
  );
}

type Gate = "boot" | "unauthenticated" | "wrong_portal" | "ready";

export function CleanerRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("boot");
  const onPublicPage = useMemo(() => isPublicCleanerPath(pathname), [pathname]);

  useEffect(() => {
    if (onPublicPage) return;

    const sb = getSupabaseBrowser();
    if (!sb) {
      setGate("unauthenticated");
      return;
    }

    let cancelled = false;

    const verify = async () => {
      setGate("boot");
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token?.trim();
      if (!token) {
        if (!cancelled) setGate("unauthenticated");
        return;
      }

      const res = await fetch("/api/cleaner/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (cancelled) return;

      if (res.status === 403) {
        setGate("wrong_portal");
        return;
      }
      if (res.status === 401) {
        setGate("unauthenticated");
        return;
      }
      if (!res.ok) {
        setGate("ready");
        return;
      }
      setGate("ready");
    };

    void verify();
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      void verify();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [onPublicPage, pathname]);

  const needsAuthRedirect = gate === "unauthenticated";

  useEffect(() => {
    if (!needsAuthRedirect || onPublicPage) return;
    const redirectPath = pathname?.trim() || "/cleaner/dashboard";
    router.replace(`/cleaner/login?redirect=${encodeURIComponent(redirectPath)}`);
  }, [needsAuthRedirect, onPublicPage, pathname, router]);

  const leaveWrongPortal = useCallback(async () => {
    await signOut();
    router.replace("/auth?intent=customer");
    router.refresh();
  }, [router]);

  if (onPublicPage) {
    return (
      <div className="min-h-dvh bg-muted/30">
        <CleanerNavBadgesProvider>
          <CleanerNotificationsProvider>{children}</CleanerNotificationsProvider>
        </CleanerNavBadgesProvider>
      </div>
    );
  }

  if (gate === "boot") {
    return (
      <AccessGatePlaceholder
        title="Checking access"
        description="Verifying your account and permissions so we can load your dashboard safely."
      />
    );
  }

  if (needsAuthRedirect && !onPublicPage) {
    return (
      <AccessGatePlaceholder
        title="Signing you in"
        description="Taking you to the sign-in page to continue."
        slowHintAfterMs={4000}
      />
    );
  }

  if (gate === "wrong_portal") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/30 px-6 py-10">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Cleaner workspace</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You are signed in, but this account is not linked to the cleaner app. Open the customer area to book and
            manage visits, or sign out and use your cleaner phone login instead.
          </p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
            <Button asChild className="rounded-xl">
              <Link href="/dashboard/bookings">Customer dashboard</Link>
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => void leaveWrongPortal()}>
              Sign out — switch account
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const showBottomNav = gate === "ready" && !onPublicPage;

  return (
    <div className="min-h-dvh bg-muted/30">
      <CleanerNavBadgesProvider>
        <CleanerNotificationsProvider>
          <div className={showBottomNav ? "pb-[calc(4.25rem+env(safe-area-inset-bottom))]" : ""}>{children}</div>
          {showBottomNav ? <CleanerBottomNav /> : null}
        </CleanerNotificationsProvider>
      </CleanerNavBadgesProvider>
    </div>
  );
}
