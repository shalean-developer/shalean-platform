"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "@/lib/auth/authClient";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin" },
  { label: "Marketing", href: "/admin/marketing" },
  { label: "Referrals", href: "/admin/referrals" },
  { label: "Subscriptions", href: "/admin/subscriptions" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Cleaners", href: "/admin/cleaners" },
  { label: "Cleaner Applications", href: "/admin/cleaner-applications" },
  { label: "Customers", href: "/admin/customers" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

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
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <aside className="w-60 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:block">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Admin</p>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block rounded-md px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => void handleAdminLogout()}
          className="mt-6 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
        >
          Logout
        </button>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
