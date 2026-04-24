"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { signOut } from "@/lib/auth/authClient";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { AdminToastHost } from "@/components/admin/AdminToastHost";
import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string };
type NavGroup = { title: string; items: readonly NavItem[] };

const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/admin" },
      { label: "Bookings", href: "/admin/bookings" },
      { label: "Pricing", href: "/admin/pricing" },
      { label: "Analytics", href: "/admin/analytics" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Notifications", href: "/admin/notifications" },
      { label: "SLA Breaches", href: "/admin/ops/sla-breaches" },
      { label: "Cleaner Performance", href: "/admin/ops/cleaner-performance" },
      { label: "Operations", href: "/admin/operations" },
    ],
  },
  {
    title: "Growth",
    items: [
      { label: "Marketing", href: "/admin/marketing" },
      { label: "Referrals", href: "/admin/referrals" },
      { label: "Subscriptions", href: "/admin/subscriptions" },
    ],
  },
  {
    title: "Workforce",
    items: [
      { label: "Cleaners", href: "/admin/cleaners" },
      { label: "Cleaner Applications", href: "/admin/cleaner-applications" },
    ],
  },
  {
    title: "Customers",
    items: [{ label: "Customers", href: "/admin/customers" }],
  },
] as const;

const MOBILE_BOTTOM_NAV = NAV_GROUPS[0].items;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navLinkClass = (active: boolean) =>
  cn(
    "block rounded-md px-3 py-2 text-sm font-medium transition",
    active
      ? "bg-blue-600 text-white dark:bg-blue-600 dark:text-white"
      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
  );

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [userLabel, setUserLabel] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const redirectTarget = useMemo(() => pathname || "/admin", [pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      if (!sb) {
        if (!cancelled) {
          setIsAllowed(false);
          setLoading(false);
        }
        return;
      }
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      const email = sessionData.session?.user?.email?.trim();
      if (!cancelled && email) setUserLabel(email);

      if (!token) {
        if (!cancelled) {
          setIsAllowed(false);
          setLoading(false);
        }
        return;
      }

      const res = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { isAdmin?: boolean };
      if (!cancelled) {
        setIsAllowed(Boolean(res.ok && json.isAdmin));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdminLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-[45vh] items-center justify-center px-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Checking admin access…</p>
      </main>
    );
  }

  if (!isAllowed) {
    return (
      <main className="flex min-h-[55vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Admin access required</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Login to continue.</p>
          <Link
            href={`/login?role=admin&redirect=${encodeURIComponent(redirectTarget)}`}
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Login as Admin
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-100 dark:bg-zinc-950">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex h-14 items-center border-b border-zinc-200 px-4 dark:border-zinc-800">
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mt-4 first:mt-0">
              <div className="px-3 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {group.title}
              </div>
              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link key={item.href} href={item.href} className={navLinkClass(active)}>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">Admin Dashboard</span>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="max-w-[140px] truncate text-xs text-zinc-600 dark:text-zinc-300 sm:max-w-[220px] sm:text-sm"
              title={userLabel}
            >
              {userLabel || "Admin"}
            </span>
            <button
              type="button"
              onClick={() => void handleAdminLogout()}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</div>
      </div>

      <AdminToastHost />

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-[min(100%,18rem)] flex-col border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Menu</span>
              <button
                type="button"
                className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Close"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="mt-4 first:mt-0">
                  <div className="px-3 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {group.title}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={navLinkClass(active)}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-zinc-200 bg-white px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        {MOBILE_BOTTOM_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 rounded-md py-2 text-center text-[11px] font-semibold transition",
                active ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
