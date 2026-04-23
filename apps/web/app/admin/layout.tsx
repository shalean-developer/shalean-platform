"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "@/lib/auth/authClient";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { AdminToastHost } from "@/components/admin/AdminToastHost";

const PRIMARY_NAV = [
  { label: "Dashboard", href: "/admin" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Pricing", href: "/admin/pricing" },
  { label: "Analytics", href: "/admin/analytics" },
] as const;

const SECONDARY_NAV = [
  { label: "Operations", href: "/admin/operations" },
  { label: "Marketing", href: "/admin/marketing" },
  { label: "Referrals", href: "/admin/referrals" },
  { label: "Subscriptions", href: "/admin/subscriptions" },
  { label: "Cleaners", href: "/admin/cleaners" },
  { label: "Cleaner Applications", href: "/admin/cleaner-applications" },
  { label: "Customers", href: "/admin/customers" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [userLabel, setUserLabel] = useState<string>("");

  const redirectTarget = useMemo(() => pathname || "/admin", [pathname]);

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
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white md:flex md:flex-col dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shalean</p>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Admin</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
          <p className="px-3 pt-4 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">More</p>
          {SECONDARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 md:px-6">
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">Admin</p>
          </div>
          <div className="hidden text-sm font-medium text-zinc-600 dark:text-zinc-300 md:block">
            {pathname === "/admin" ? "Dashboard" : pathname.replace("/admin/", "").replace(/-/g, " ")}
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden max-w-[200px] truncate text-sm text-zinc-600 dark:text-zinc-300 sm:block" title={userLabel}>
              {userLabel || "Admin"}
            </span>
            <button
              type="button"
              onClick={() => void handleAdminLogout()}
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</div>
      </div>

      <AdminToastHost />

      {/* Mobile primary nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-zinc-200 bg-white/95 px-1 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex-1 rounded-md py-2 text-center text-[11px] font-semibold",
                active ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
