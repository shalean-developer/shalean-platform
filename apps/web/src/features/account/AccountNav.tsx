"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ExternalLink,
  MessageSquare,
  CreditCard,
  FileText,
  Gift,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  Menu,
  Repeat,
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
  DialogTrigger,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { reportSignOutFailure, signOut } from "@/lib/auth/authClient";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/account", label: "Home", icon: Home, exact: true },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/account/recurring", label: "Plans", icon: Repeat },
  { href: "/account/addresses", label: "Properties", icon: MapPin },
  { href: "/account/payments", label: "Payments", icon: CreditCard },
  { href: "/account/invoices", label: "Invoices", icon: FileText },
  { href: "/account/sales-documents", label: "Quotes", icon: FileText },
  { href: "/account/reviews", label: "Reviews", icon: Star },
  { href: "/account/rewards", label: "Rewards & Offers", icon: Sparkles },
  { href: "/account/referrals", label: "Refer & earn", icon: Gift },
  { href: "/account/book", label: "Book a clean", icon: Sparkles },
  { href: "/account/help", label: "Help", icon: HelpCircle },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/account", label: "Home", icon: Home, exact: true },
  { href: "/account/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/account/invoices", label: "Invoices", icon: FileText },
  { href: "/account/book", label: "Book", icon: Sparkles },
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


function AccountNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, icon: Icon, exact } = item;
  const active = isNavActive(pathname, href, exact);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-11 items-center gap-3.5 rounded-full px-4 py-2 text-[0.9375rem] font-normal transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-6 w-6 shrink-0 transition-colors",
          active ? "text-primary" : "text-foreground group-hover:text-accent-foreground",
        )}
        strokeWidth={1.5}
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
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } catch (e) {
      reportSignOutFailure(e);
    } finally {
      setBusy(false);
    }
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

function AccountNavigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: "nearest" });
  }, [pathname]);

  return (
    <nav ref={navRef} tabIndex={0} aria-label="Account navigation" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) onNavigate?.(); }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
      <div className="space-y-2">
        {NAV.map(item => <AccountNavLink key={item.href} item={item} pathname={pathname} />)}
      </div>
    </nav>
  );
}

export function AccountSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className="sticky top-[76px] z-30 hidden h-[calc(100dvh-76px)] w-72 min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
      <AccountNavigation pathname={pathname} />
      <div className="shrink-0 border-t border-border px-5 py-2">
        <LogoutDialog><LogOut aria-hidden="true" className="h-6 w-6 shrink-0" />Sign out</LogoutDialog>
      </div>
    </aside>
  );
}

export function AccountHeader() {
  const router = useRouter();
  const { user } = useUser();
  const meta = user?.user_metadata as { full_name?: string } | undefined;
  const initials = initialsFromUser(user?.email, meta?.full_name);

  async function handleLogout() {
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } catch (e) {
      reportSignOutFailure(e);
    }
  }

  return (
    <header className="sticky top-0 z-40 h-[76px] border-b border-border bg-card">
      <div className="flex h-full w-full items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/account" aria-label="Shalean customer home" className="flex min-h-11 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ShaleanNavLogo className="h-9 w-auto sm:h-10" intrinsicHeight={64} />
        </Link>
        <div className="flex shrink-0 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="Account menu"
              >
                <Avatar className="h-10 w-10 border border-border shadow-sm">
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} collisionPadding={16} className="w-56 max-w-[calc(100vw-2rem)] p-1 [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:gap-3 [&_[role=menuitem]]:rounded-lg [&_[role=menuitem]]:px-3">
              <DropdownMenuItem asChild>
                <Link href="/account/profile"><UserRound aria-hidden="true" className="h-4 w-4 shrink-0" />Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account/notifications"><Bell aria-hidden="true" className="h-4 w-4 shrink-0" />Notifications</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account/cases"><MessageSquare aria-hidden="true" className="h-4 w-4 shrink-0" />My support requests</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/account/help"><HelpCircle aria-hidden="true" className="h-4 w-4 shrink-0" />Help centre</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/"><ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />Back to website</Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-muted-foreground focus:bg-destructive/10 focus:text-destructive" onClick={() => void handleLogout()}>
                <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
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
  const [menuOpen, setMenuOpen] = useState(false);

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
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogTrigger asChild>
            <button type="button" aria-label="Open account navigation" className="flex min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[0.6875rem] font-medium text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
              <span className="flex h-9 w-9 items-center justify-center"><Menu aria-hidden="true" className="h-5 w-5" /></span>
              Menu
            </button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b border-border p-4 pr-12 text-left"><DialogTitle>My account</DialogTitle></DialogHeader>
            <AccountNavigation pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            <div className="shrink-0 border-t border-border p-3">
              <LogoutDialog><LogOut aria-hidden="true" className="h-4 w-4" />Sign out</LogoutDialog>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </nav>
  );
}
