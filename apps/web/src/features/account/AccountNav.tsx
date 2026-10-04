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
  LifeBuoy,
  LogOut,
  MapPin,
  MessageCircle,
  Repeat,
  Settings,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
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
      { href: "/account/invoices", label: "Monthly billing", icon: FileText },
      { href: "/account/payments", label: "Payments", icon: CreditCard },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/account/addresses", label: "Properties", icon: MapPin },
      { href: "/account/reviews", label: "Reviews", icon: Star },
      { href: "/account/referrals", label: "Referrals", icon: Gift },
      { href: "/account/rewards", label: "Rewards & Offers", icon: Sparkles },
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

function AccountNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, icon: Icon, exact } = item;
  const active = isNavActive(pathname, href, exact);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground",
        )}
        strokeWidth={1.75}
      />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
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
        className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out of Shalean?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to log out? You&apos;ll need to sign in again to access your account.
          </p>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleLogout()} disabled={busy}>
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
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link
          href="/"
          className="flex min-w-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Shalean home"
        >
          <ShaleanNavLogo className="h-7 w-auto" intrinsicHeight={64} />
        </Link>
      </div>

      <nav className="scrollbar-hide flex-1 overflow-y-auto px-3 py-4" aria-label="Account navigation">
        {NAV.map((section, sectionIndex) => (
          <div key={section.title ?? "home"} className={sectionIndex > 0 ? "mt-5" : ""}>
            {section.title ? (
              <p className="mb-1 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                {section.title}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <AccountNavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-2">
          <LogoutDialog>
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Log out
          </LogoutDialog>
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/account/profile"
          aria-current={isNavActive(pathname, "/account/profile") ? "page" : undefined}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground group-hover:text-accent-foreground">View profile</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </aside>
  );
}

export function AccountHeader() {
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
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex min-h-16 w-full max-w-[var(--ui-container-wide)] items-center justify-between gap-4 px-[var(--ui-page-gutter)] py-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground sm:text-lg">Welcome back, {firstName}</p>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">Manage your bookings, billing and account.</p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Button asChild variant="outline" size="sm" className="hidden rounded-full lg:inline-flex">
            <Link href="/account/cases">
              <LifeBuoy className="h-4 w-4" />
              Support cases
            </Link>
          </Button>

          <a
            href="https://wa.me/27825915525"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden min-h-9 items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 text-xs font-semibold text-success transition-colors hover:bg-success/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex"
            aria-label="Contact Shalean support on WhatsApp at 082 591 5525"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            082 591 5525
          </a>

          <Link
            href="/account/notifications"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-h-9 items-center gap-2 rounded-full border border-border bg-background p-0.5 pr-2.5 transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="Account menu"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[7rem] truncate text-sm font-medium text-foreground md:inline">{firstName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link href="/account/profile">Profile settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="lg:hidden">
                <Link href="/account/cases">Support cases</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/">Back to website</Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void handleLogout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/** Compatibility export for older account-shell imports. */
export const AccountTopBar = AccountHeader;

export function AccountMobileNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/90 md:hidden"
      aria-label="Account mobile navigation"
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch justify-around px-1 py-1.5">
        {MOBILE_NAV.map((item) => {
          const { href, label, icon: Icon, exact } = item;
          const active = isNavActive(pathname, href, exact);
          const isBook = href === "/account/book";
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[0.6875rem] font-medium transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                  isBook
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : active
                      ? "bg-primary/10 text-primary"
                      : "group-hover:bg-accent",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="line-clamp-1 text-center leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
