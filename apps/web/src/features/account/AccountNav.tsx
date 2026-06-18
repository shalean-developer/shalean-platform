"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CreditCard,
  FileText,
  Gift,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  MessageCircle,
  Repeat,
  Settings,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/authClient";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exact?: boolean;
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    items: [{ href: "/account", label: "Home", icon: Home, exact: true }],
  },
  {
    title: "Bookings",
    items: [
      { href: "/account/bookings", label: "My Bookings", icon: CalendarDays },
      { href: "/account/recurring", label: "Recurring Plans", icon: Repeat },
    ],
  },
  {
    title: "Billing",
    items: [
      { href: "/account/invoices", label: "Invoices", icon: FileText },
      { href: "/account/payments", label: "Payments", icon: CreditCard },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/account/addresses", label: "Properties", icon: MapPin },
      { href: "/account/reviews", label: "Reviews", icon: Star },
      { href: "/account/referrals", label: "Referrals", icon: Gift },
      { href: "/account/profile", label: "Profile Settings", icon: Settings },
      { href: "/account/help", label: "Help & Support", icon: HelpCircle },
    ],
  },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/account", label: "Home", icon: Home, exact: true },
  { href: "/account/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/account/invoices", label: "Billing", icon: FileText },
  { href: "/account/book", label: "Book", icon: Sparkles },
  { href: "/account/profile", label: "Profile", icon: UserRound },
];

function isNavActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsFromUser(email: string | undefined, fullName: string | undefined): string {
  const name = (fullName?.trim() || email?.split("@")[0] || "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function displayName(email: string | undefined, fullName: string | undefined): string {
  return fullName?.trim() || email?.split("@")[0] || "Account";
}

function LogoutDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setBusy(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out of Shalean?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Are you sure you want to log out? You&apos;ll need to sign in again to access your account.
          </p>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={() => void handleLogout()}
              disabled={busy}
            >
              {busy ? "Signing out…" : "Log out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AccountSidebar() {
  const pathname = usePathname() ?? "";
  const { user } = useUser();
  const meta = user?.user_metadata as { full_name?: string } | undefined;
  const initials = initialsFromUser(user?.email, meta?.full_name);
  const name = displayName(user?.email, meta?.full_name);

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r border-gray-100 bg-white md:flex">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
          <Sparkles className="h-4 w-4 text-white" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight text-blue-700">Shalean</p>
          <p className="text-[10px] font-medium text-gray-400">Cleaning Services</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Account navigation">
        {NAV.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-5" : ""}>
            {section.title ? (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {section.title}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon, exact }) => {
                const active = isNavActive(pathname, href, exact);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                    )}
                  >
                    <Icon
                      className={cn("h-4 w-4 shrink-0", active ? "text-blue-600" : "text-gray-400")}
                      strokeWidth={1.75}
                    />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Log out */}
        <div className="mt-2">
          <LogoutDialog>
            <LogOut className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.75} />
            Log out
          </LogoutDialog>
        </div>
      </nav>

      {/* User profile card */}
      <div className="border-t border-gray-100 p-3">
        <Link
          href="/account/profile"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-gray-50"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-blue-600 text-xs font-semibold text-white">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{name}</p>
            <p className="text-xs text-blue-600">View profile</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
        </Link>
      </div>
    </aside>
  );
}

export function AccountTopBar() {
  const router = useRouter();
  const { user } = useUser();
  const meta = user?.user_metadata as { full_name?: string } | undefined;
  const initials = initialsFromUser(user?.email, meta?.full_name);
  const name = displayName(user?.email, meta?.full_name);
  const firstName = name.split(" ")[0] ?? "there";

  async function handleLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[5rem] items-center justify-between gap-4 border-b border-gray-100 bg-white px-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Welcome back, {firstName} 👋
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">Here&apos;s what&apos;s happening with your account.</p>
      </div>

      {/* Right: help + bell + avatar */}
      <div className="flex shrink-0 items-center gap-4">
        {/* WhatsApp help */}
        <div className="hidden items-center gap-2 sm:flex">
          <p className="text-xs text-gray-500">Need help?</p>
          <a
            href="https://wa.me/27825915525"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            082 591 5525
          </a>
        </div>

        {/* Bell */}
        <Link
          href="/account/notifications"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:border-gray-300 hover:bg-gray-50"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </Link>

        {/* Avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-gray-200 p-0.5 pr-3 transition hover:border-blue-300"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-blue-600 text-xs font-semibold text-white">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[110px] truncate text-sm font-medium text-gray-900 sm:inline">
                {firstName}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/account/profile">Profile settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/">Back to website</Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => void handleLogout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function AccountMobileNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Account mobile navigation"
    >
      <div className="flex w-full items-stretch justify-around px-1 py-2">
        {MOBILE_NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = isNavActive(pathname, href, exact);
          const isBook = href === "/account/book";
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium",
                active ? "text-blue-600" : "text-gray-400",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl",
                  isBook
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : active
                      ? "bg-blue-50"
                      : "",
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
  );
}
