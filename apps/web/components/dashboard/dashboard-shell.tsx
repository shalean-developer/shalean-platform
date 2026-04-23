"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  CreditCard,
  Gift,
  LayoutDashboard,
  LogOut,
  MapPin,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/authClient";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";

function initialsFromUser(email: string | undefined, fullName: string | undefined): string {
  const name = (fullName?.trim() || email?.split("@")[0] || "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function displayName(email: string | undefined, fullName: string | undefined): string {
  return fullName?.trim() || email?.split("@")[0] || "Account";
}

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/dashboard/book", label: "Book cleaning", icon: Sparkles },
  { href: "/dashboard/addresses", label: "Addresses", icon: MapPin },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
  { href: "/dashboard/referrals", label: "Referrals", icon: Gift },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user } = useUser();
  const meta = user?.user_metadata as { full_name?: string; phone?: string } | undefined;
  const initials = initialsFromUser(user?.email, meta?.full_name);
  const shortName = displayName(user?.email, meta?.full_name).split(" ")[0] ?? "Account";

  async function handleLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-zinc-50 pb-[4.5rem] md:pb-0 dark:bg-zinc-950">
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-60 border-r border-zinc-200 bg-white md:flex md:flex-col dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex h-14 items-center border-b border-zinc-100 px-4 dark:border-zinc-800">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-blue-600">
            Shalean
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Dashboard">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
          <Link
            href="/"
            className="block rounded-xl px-3 py-2 text-center text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            Back to website
          </Link>
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-blue-600 md:hidden">
            Shalean
          </Link>
          <span className="hidden text-sm font-medium text-zinc-500 md:inline">Customer dashboard</span>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-zinc-200 p-0.5 pr-2 transition hover:border-blue-200 dark:border-zinc-700 dark:hover:border-blue-800"
                  aria-label="Account menu"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[120px] truncate text-sm font-medium text-zinc-800 sm:inline dark:text-zinc-200">
                    {shortName}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/">Back to home</Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => void handleLogout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
        aria-label="Mobile dashboard"
      >
        <div className="flex w-full items-stretch justify-start gap-0 overflow-x-auto px-1 py-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
            const isBook = href === "/dashboard/book";
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium",
                  active ? "text-blue-600" : "text-zinc-500",
                  isBook && "relative",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    isBook ? "bg-blue-600 text-white shadow-md shadow-blue-600/30" : active ? "bg-blue-50 dark:bg-blue-950/40" : "",
                  )}
                >
                  <Icon className={cn("h-5 w-5", isBook ? "text-white" : "")} strokeWidth={1.75} />
                </span>
                <span className="line-clamp-1 text-center leading-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
