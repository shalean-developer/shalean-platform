"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronRight,
  Eye,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Megaphone,
  PenLine,
  Receipt,
  Repeat,
  Search,
  Send,
  Settings,
  Shield,
  ShoppingCart,
  Tag,
  ThumbsUp,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { useNotifications } from "@/hooks/useNotifications";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export const OFFICE_NAV_SECTIONS: NavSection[] = [
  {
    title: "MAIN",
    items: [
      { label: "Dashboard", href: "/office", icon: LayoutDashboard },
      { label: "Bookings", href: "/office/bookings", icon: BookOpen },
      { label: "Recurring", href: "/office/recurring", icon: Repeat },
      { label: "Payouts", href: "/office/payouts", icon: Wallet },
      { label: "Pricing", href: "/office/pricing", icon: Tag },
    ],
  },
  {
    title: "ANALYTICS",
    items: [
      { label: "Analytics", href: "/office/analytics", icon: BarChart3 },
      { label: "Funnel intelligence", href: "/office/funnel-intelligence", icon: TrendingUp },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { label: "Schedule", href: "/office/schedule", icon: Calendar },
      { label: "Notifications", href: "/office/notifications", icon: Bell },
      { label: "Delivery logs", href: "/office/notification-logs", icon: Mail },
      { label: "Lifecycle emails", href: "/office/lifecycle-emails", icon: Send },
      { label: "Ops Health", href: "/office/ops-health", icon: Activity },
      { label: "Launch check", href: "/office/launch-check", icon: CheckCircle },
      { label: "Templates", href: "/office/templates", icon: FileText },
    ],
  },
  {
    title: "QUALITY",
    items: [
      { label: "SLA Breaches", href: "/office/sla-breaches", icon: AlertTriangle },
      { label: "Cleaner Performance", href: "/office/cleaner-performance", icon: Award },
      { label: "Earnings disputes", href: "/office/disputes", icon: Shield },
      { label: "Dispatch metrics", href: "/office/metrics", icon: Zap },
      { label: "Operations", href: "/office/operations", icon: Settings },
    ],
  },
  {
    title: "GROWTH",
    items: [
      { label: "Marketing", href: "/office/marketing", icon: Megaphone },
      { label: "Blog", href: "/office/blog", icon: PenLine },
      { label: "Conversion", href: "/office/conversion", icon: ShoppingCart },
      { label: "SEO insights", href: "/office/seo-insights", icon: Eye },
      { label: "SEO attribution", href: "/office/seo-attribution", icon: Link2 },
      { label: "Referrals", href: "/office/referrals", icon: HeartHandshake },
    ],
  },
  {
    title: "WORKFORCE",
    items: [
      { label: "Cleaners", href: "/office/cleaners", icon: Users },
      { label: "Teams", href: "/office/teams", icon: UserCheck },
      { label: "Cleaner Applications", href: "/office/cleaner-applications", icon: UserPlus },
    ],
  },
  {
    title: "CUSTOMERS",
    items: [
      { label: "Customers", href: "/office/customers", icon: Users },
      { label: "Quotes", href: "/office/sales-documents", icon: FileText },
      { label: "Monthly billing", href: "/office/invoices", icon: Receipt },
      { label: "Reviews", href: "/office/reviews", icon: ThumbsUp },
      { label: "Review funnel", href: "/office/review-funnel", icon: MessageCircle },
    ],
  },
];

// Flat list for command palette / top-bar label lookup
export const OFFICE_NAV_ALL_ITEMS: (NavItem & { section: string })[] = OFFICE_NAV_SECTIONS.flatMap(
  (s) => s.items.map((item) => ({ ...item, section: s.title })),
);

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/office") return pathname === "/office";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type OfficeSidebarProps = {
  userLabel: string;
  onLogout: () => void;
  onClose?: () => void;
};

export function OfficeSidebarContent({ userLabel, onLogout, onClose }: OfficeSidebarProps) {
  const pathname = usePathname() ?? "";

  const initials = userLabel
    ? userLabel
        .split("@")[0]!
        .split(/[._-]/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2) || "AD"
    : "AD";

  return (
    <div className="flex h-full flex-col bg-[--sidebar-bg] text-[--sidebar-fg]">
      {onClose ? (
        <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-2 md:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2.5 scrollbar-hide" aria-label="Office navigation">
        {OFFICE_NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-3">
            {/* Section label */}
            <p className="mb-1 px-2.5 text-[9px] font-bold uppercase tracking-widest text-[--sidebar-muted] select-none">
              {section.title}
            </p>
            {/* Nav items */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isItemActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-[--sidebar-active] text-[--sidebar-active-fg]"
                        : "text-[--sidebar-muted] hover:bg-[--sidebar-hover] hover:text-[--sidebar-fg]",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-[--sidebar-active-fg]" : "")} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-[--sidebar-border] p-1.5">
        <div className="flex items-center gap-1.5 rounded-lg px-1 py-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700 text-[11px] font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-[--sidebar-fg]">{userLabel || "Admin"}</p>
            <p className="text-[10px] text-[--sidebar-muted]">Administrator</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg p-1.5 text-[--sidebar-muted] hover:bg-[--sidebar-hover] hover:text-red-400 transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

type OfficeTopBarProps = {
  userLabel: string;
  onMenuOpen: () => void;
  onLogout: () => void;
  onCommandPalette: () => void;
};

export function OfficeTopBar({ userLabel, onMenuOpen, onLogout, onCommandPalette }: OfficeTopBarProps) {
  const { notifications } = useNotifications();
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;
  const notificationBadge = unreadNotifications > 99 ? "99+" : String(unreadNotifications);

  const initials = userLabel
    ? userLabel
        .split("@")[0]!
        .split(/[._-]/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2) || "AD"
    : "AD";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-3 shadow-sm sm:px-4">
      {/* Left: logo + mobile menu */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden"
          aria-label="Open navigation"
          onClick={onMenuOpen}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/office" aria-label="Shalean office dashboard" className="flex shrink-0 items-center">
          <ShaleanNavLogo className="h-8 w-auto max-w-[148px]" intrinsicHeight={120} />
        </Link>
      </div>

      {/* Right */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Search */}
        <button
          type="button"
          className="flex h-10 w-44 items-center gap-2 rounded-xl border border-border bg-slate-50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/20 sm:w-56"
          onClick={onCommandPalette}
          aria-label="Search (Cmd+K)"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">Search...</span>
          <kbd className="hidden shrink-0 rounded-md border border-border bg-white px-1.5 py-0.5 text-[10px] font-medium leading-none sm:inline-flex">
            ⌘K
          </kbd>
        </button>

        {/* Notification bell */}
        <Link
          href="/office/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/20"
          aria-label={
            unreadNotifications > 0
              ? `Open notifications, ${unreadNotifications} unread`
              : "Open notifications"
          }
        >
          <Bell className="h-5 w-5" />
          {unreadNotifications > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {notificationBadge}
            </span>
          ) : null}
        </Link>

        {/* Avatar + role */}
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
          title="Sign out"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {initials}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-semibold leading-tight text-foreground">Admin console</p>
            <p className="max-w-[140px] truncate text-[11px] text-muted-foreground">{userLabel || "Administrator"}</p>
          </div>
        </button>
      </div>
    </header>
  );
}

// Command palette
type CommandPaletteProps = { open: boolean; onClose: () => void };

export function OfficeCommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const closePalette = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  const filtered = query.trim()
    ? OFFICE_NAV_ALL_ITEMS.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.section.toLowerCase().includes(query.toLowerCase()),
      )
    : OFFICE_NAV_ALL_ITEMS;

  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePalette();
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, closePalette]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={closePalette}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Esc
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No pages found.</p>
          ) : (
            <div className="space-y-1">
              {filtered.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted transition-colors"
                    onClick={() => {
                      router.push(item.href);
                      closePalette();
                    }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.section}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
