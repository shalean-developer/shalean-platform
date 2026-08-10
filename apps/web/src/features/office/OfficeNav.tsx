"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, type ComponentType, type RefObject, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Copy,
  DollarSign,
  Eye,
  FileText,
  Gift,
  HeartHandshake,
  Image as ImageIcon,
  Boxes,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Receipt,
  Repeat,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  Tag,
  Target,
  ThumbsUp,
  TrendingUp,
  Scale,
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

type NavIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
};

type NavModule = {
  id: string;
  label: string;
  icon: NavIcon;
  href?: string;
  children?: NavItem[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export const OFFICE_NAV_MODULES: NavModule[] = [
  { id: "dashboard", label: "Dashboard", href: "/office", icon: LayoutDashboard },
  {
    id: "bookings",
    label: "Bookings",
    icon: BookOpen,
    children: [
      { label: "Bookings", href: "/office/bookings", icon: BookOpen },
      { label: "Recurring", href: "/office/recurring", icon: Repeat },
      { label: "Schedule", href: "/office/schedule", icon: Calendar },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    children: [
      { label: "Financial dashboard", href: "/office/financial-dashboard", icon: BarChart3 },
      { label: "Business health", href: "/office/business-health", icon: Activity },
      { label: "Cash flow", href: "/office/cash-flow", icon: TrendingUp },
      { label: "Expenses", href: "/office/expenses", icon: Receipt },
      { label: "Recurring expenses", href: "/office/recurring-expenses", icon: Repeat },
      { label: "Budgets", href: "/office/budgets", icon: Target },
      { label: "Vendors", href: "/office/expense-vendors", icon: Building2 },
      { label: "Reports", href: "/office/expense-reports", icon: FileText },
      { label: "Payment reconciliation", href: "/office/payment-reconciliation", icon: Scale },
      { label: "Booking profit", href: "/office/booking-profitability", icon: DollarSign },
      { label: "Referral finance", href: "/office/referral-finance", icon: HeartHandshake },
      { label: "Referral reconciliation", href: "/office/referral-reconciliation", icon: Scale },
      { label: "Referral fraud", href: "/office/referral-fraud", icon: Shield },
      { label: "Payouts", href: "/office/payouts", icon: Wallet },
      { label: "Payout approvals", href: "/office/payouts/approvals", icon: CheckCircle },
      { label: "Pricing", href: "/office/pricing", icon: Tag },
      { label: "Monthly invoices", href: "/office/invoices", icon: FileText },
      { label: "Zoho sync", href: "/office/billing", icon: Receipt },
      { label: "Zoho integration", href: "/office/zoho-integration", icon: Settings },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    children: [
      { label: "Analytics", href: "/office/analytics", icon: BarChart3 },
      { label: "Funnel intelligence", href: "/office/funnel-intelligence", icon: TrendingUp },
      { label: "Conversion", href: "/office/conversion", icon: ShoppingCart },
      { label: "SEO insights", href: "/office/seo-insights", icon: Eye },
      { label: "SEO attribution", href: "/office/seo-attribution", icon: Link2 },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Settings,
    children: [
      { label: "Notifications", href: "/office/notifications", icon: Bell },
      { label: "Delivery logs", href: "/office/notification-logs", icon: Mail },
      { label: "Email operations", href: "/office/email-operations", icon: Mail },
      { label: "Lifecycle emails", href: "/office/lifecycle-emails", icon: Send },
      { label: "Ops Health", href: "/office/ops-health", icon: Activity },
      { label: "Launch check", href: "/office/launch-check", icon: CheckCircle },
      { label: "Templates", href: "/office/templates", icon: FileText },
      { label: "SLA Breaches", href: "/office/sla-breaches", icon: AlertTriangle },
      { label: "Ops queue", href: "/office/ops-queue", icon: ClipboardList },
      { label: "Cleaner Performance", href: "/office/cleaner-performance", icon: Award },
      { label: "Inventory", href: "/office/inventory", icon: Boxes },
      { label: "Earnings disputes", href: "/office/disputes", icon: Shield },
      { label: "Cleaner reports & feedback", href: "/office/cleaner-report-feedback", icon: MessageCircle },
      { label: "Dispatch metrics", href: "/office/metrics", icon: Zap },
      { label: "Operations", href: "/office/operations", icon: Settings },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    icon: Megaphone,
    children: [
      { label: "Marketing ROI", href: "/office/marketing", icon: Megaphone },
      { label: "Campaigns", href: "/office/marketing/campaigns", icon: Gift },
      { label: "Social Posts", href: "/office/marketing/social", icon: Share2 },
      { label: "Connected Accounts", href: "/office/marketing/connected-accounts", icon: Link2 },
      { label: "Platform Intelligence", href: "/office/marketing/intelligence", icon: Activity },
      { label: "Email Campaigns", href: "/office/marketing/email", icon: Mail },
      { label: "Landing Pages", href: "/office/marketing/landing-pages", icon: LayoutTemplate },
      { label: "Campaign Analytics", href: "/office/marketing/analytics", icon: BarChart3 },
      { label: "Campaign Templates", href: "/office/marketing/templates", icon: Copy },
      { label: "Campaign Assets", href: "/office/marketing/assets", icon: ImageIcon },
      { label: "Promotions", href: "/office/promotions", icon: Gift },
      { label: "Blog", href: "/office/blog", icon: PenLine },
      { label: "Referrals", href: "/office/referrals", icon: HeartHandshake },
    ],
  },
  {
    id: "workforce",
    label: "Workforce",
    icon: Users,
    children: [
      { label: "Cleaners", href: "/office/cleaners", icon: Users },
      { label: "Teams", href: "/office/teams", icon: UserCheck },
      { label: "Cleaner Applications", href: "/office/cleaner-applications", icon: UserPlus },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: ThumbsUp,
    children: [
      { label: "Customers", href: "/office/customers", icon: Users },
      { label: "Reviews", href: "/office/reviews", icon: ThumbsUp },
      { label: "Review funnel", href: "/office/review-funnel", icon: MessageCircle },
    ],
  },
];

/** Legacy flat sections — derived from modules for command palette grouping. */
export const OFFICE_NAV_SECTIONS: NavSection[] = OFFICE_NAV_MODULES.map((module) => ({
  title: module.label.toUpperCase(),
  items: module.href
    ? [{ label: module.label, href: module.href, icon: module.icon }]
    : (module.children ?? []),
}));

export const OFFICE_NAV_ALL_ITEMS: (NavItem & { section: string })[] = OFFICE_NAV_MODULES.flatMap((module) => {
  if (module.href) {
    return [{ label: module.label, href: module.href, icon: module.icon, section: module.label }];
  }
  return (module.children ?? []).map((item) => ({ ...item, section: module.label }));
});

const SIDEBAR_COLLAPSED_KEY = "office-sidebar-collapsed";

export function useOfficeSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) setCollapsed(stored === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { collapsed, toggleCollapsed, setCollapsed };
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/office") return pathname === "/office";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isModuleActive(pathname: string, module: NavModule): boolean {
  if (module.href) return isItemActive(pathname, module.href);
  return module.children?.some((item) => isItemActive(pathname, item.href)) ?? false;
}

function truncateLabel(label: string, max = 8): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max)}…`;
}

function userInitials(userLabel: string): string {
  if (!userLabel) return "AD";
  return (
    userLabel
      .split("@")[0]!
      .split(/[._-]/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "AD"
  );
}

function findActiveModuleId(pathname: string): string | null {
  const match = OFFICE_NAV_MODULES.find(
    (module) => module.children?.some((item) => isItemActive(pathname, item.href)),
  );
  return match?.id ?? null;
}

type FlyoutPosition = {
  anchorRect: DOMRect;
  sidebarRect: DOMRect | null;
};

function computeCollapsedFlyoutStyle(
  anchorRect: DOMRect,
  sidebarRect: DOMRect | null,
  itemCount: number,
): CSSProperties {
  const gap = 10;
  const left = (sidebarRect?.right ?? anchorRect.right) + gap;
  const estimatedHeight = 40 + itemCount * 36;
  const viewportPad = 12;
  const maxTop = window.innerHeight - estimatedHeight - viewportPad;
  let top = anchorRect.top;
  if (top > maxTop) top = Math.max(viewportPad, maxTop);

  return {
    top,
    left,
    maxHeight: window.innerHeight - viewportPad * 2,
    backgroundColor: "#ffffff",
  };
}

type ModuleFlyoutProps = {
  module: NavModule;
  pathname: string;
  position: FlyoutPosition;
  anchorRef: RefObject<HTMLElement | null>;
  onClose?: () => void;
};

function CollapsedModuleFlyout({ module, pathname, position, anchorRef, onClose }: ModuleFlyoutProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemCount = module.children?.length ?? 0;
  const flyoutStyle = computeCollapsedFlyoutStyle(position.anchorRect, position.sidebarRect, itemCount);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [anchorRef, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      className="office-nav-flyout fixed z-[100] w-52 overflow-y-auto rounded-lg py-1"
      style={flyoutStyle}
      role="menu"
      aria-label={`${module.label} submenu`}
    >
      <p className="sticky top-0 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#5c6578]">
        {module.label}
      </p>
      {(module.children ?? []).map((item) => {
        const active = isItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            onClick={onClose}
            className={cn(
              "mx-1 flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
              active ? "bg-[#408df7] text-white" : "text-[#313949] hover:bg-[#eef1f6]",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>,
    document.body,
  );
}

type InlineModuleChildrenProps = {
  module: NavModule;
  pathname: string;
  onClose?: () => void;
};

function InlineModuleChildren({ module, pathname, onClose }: InlineModuleChildrenProps) {
  return (
    <div className="mb-0.5 ml-[18px] space-y-0.5 border-l border-[--sidebar-border] py-0.5 pl-2">
      {(module.children ?? []).map((item) => {
        const active = isItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors",
              active
                ? "bg-[--sidebar-active] text-[--sidebar-active-fg]"
                : "text-[--sidebar-muted] hover:bg-[--sidebar-hover] hover:text-[--sidebar-fg]",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

type NavModuleRowProps = {
  module: NavModule;
  collapsed: boolean;
  pathname: string;
  openModuleId: string | null;
  setOpenModuleId: (id: string | null) => void;
  sidebarRef?: RefObject<HTMLElement | null>;
  onClose?: () => void;
};

function NavModuleRow({
  module,
  collapsed,
  pathname,
  openModuleId,
  setOpenModuleId,
  sidebarRef,
  onClose,
}: NavModuleRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [flyoutPosition, setFlyoutPosition] = useState<FlyoutPosition | null>(null);
  const hasChildren = Boolean(module.children?.length);
  const active = isModuleActive(pathname, module);
  const isOpen = openModuleId === module.id;
  const Icon = module.icon;

  useEffect(() => {
    if (!collapsed || !isOpen || !rowRef.current) {
      setFlyoutPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchorRect = rowRef.current?.getBoundingClientRect();
      if (!anchorRect) return;
      const sidebarRect = sidebarRef?.current?.getBoundingClientRect() ?? null;
      setFlyoutPosition({ anchorRect, sidebarRect });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [collapsed, isOpen, sidebarRef]);

  const activeClasses = "bg-[--sidebar-active] text-[--sidebar-active-fg]";
  const inactiveClasses = "text-[--sidebar-fg] hover:bg-[--sidebar-hover]";

  if (!hasChildren && module.href) {
    if (collapsed) {
      return (
        <Link
          href={module.href}
          onClick={onClose}
          title={module.label}
          className={cn(
            "relative flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-center transition-colors",
            active ? activeClasses : inactiveClasses,
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          <span className="max-w-full truncate text-[10px] font-medium leading-tight">{truncateLabel(module.label, 7)}</span>
        </Link>
      );
    }

    return (
      <Link
        href={module.href}
        onClick={onClose}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
          active ? activeClasses : inactiveClasses,
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
        <span className="truncate">{module.label}</span>
      </Link>
    );
  }

  if (collapsed) {
    return (
      <div ref={rowRef} className="relative">
        <button
          type="button"
          title={module.label}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={() => setOpenModuleId(isOpen ? null : module.id)}
          className={cn(
            "relative flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-center transition-colors",
            active || isOpen ? activeClasses : inactiveClasses,
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          <span className="max-w-full truncate text-[10px] font-medium leading-tight">{truncateLabel(module.label, 7)}</span>
          <span
            className="pointer-events-none absolute bottom-1.5 right-1.5 h-0 w-0 border-b-[5px] border-r-[5px] border-b-transparent border-r-[--sidebar-muted]"
            aria-hidden
          />
        </button>
        {isOpen && flyoutPosition ? (
          <CollapsedModuleFlyout
            module={module}
            pathname={pathname}
            position={flyoutPosition}
            anchorRef={rowRef}
            onClose={() => {
              setOpenModuleId(null);
              onClose?.();
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div ref={rowRef}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpenModuleId(isOpen ? null : module.id)}
        className={cn(
          "flex w-full items-center gap-1 rounded-lg py-2 pl-1 pr-2.5 text-left text-[13px] font-medium transition-colors",
          active || isOpen ? activeClasses : inactiveClasses,
        )}
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-90")}
          strokeWidth={2}
        />
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">{module.label}</span>
      </button>
      {isOpen ? <InlineModuleChildren module={module} pathname={pathname} onClose={onClose} /> : null}
    </div>
  );
}

type OfficeSidebarProps = {
  userLabel: string;
  onLogout: () => void;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  showCollapseToggle?: boolean;
  sidebarRef?: RefObject<HTMLElement | null>;
};

export function OfficeSidebarContent({
  userLabel,
  onLogout,
  onClose,
  collapsed = false,
  onToggleCollapsed,
  showCollapseToggle = false,
  sidebarRef,
}: OfficeSidebarProps) {
  const pathname = usePathname() ?? "";
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const initials = userInitials(userLabel);
  const isMobileDrawer = Boolean(onClose);
  const useCollapsedNav = collapsed && !isMobileDrawer;

  useEffect(() => {
    if (useCollapsedNav) {
      setOpenModuleId(null);
      return;
    }
    setOpenModuleId(findActiveModuleId(pathname));
  }, [pathname, useCollapsedNav]);

  return (
    <div className="flex h-full flex-col bg-[--sidebar-bg] text-[--sidebar-fg]">
      {onClose ? (
        <div className="flex shrink-0 items-center justify-end border-b border-[--sidebar-border] px-2 py-2 md:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[--sidebar-muted] hover:bg-[--sidebar-hover] hover:text-[--sidebar-fg]"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      <nav
        className={cn("flex-1 overflow-y-auto py-2 scrollbar-hide", collapsed ? "px-1" : "px-2")}
        aria-label="Office navigation"
      >
        <div className={cn("space-y-0.5", collapsed && "space-y-1")}>
          {OFFICE_NAV_MODULES.map((module) => (
            <NavModuleRow
              key={module.id}
              module={module}
              collapsed={useCollapsedNav}
              pathname={pathname}
              openModuleId={openModuleId}
              setOpenModuleId={setOpenModuleId}
              sidebarRef={sidebarRef}
              onClose={onClose}
            />
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-[--sidebar-border] p-1.5">
        {collapsed && !isMobileDrawer ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[--sidebar-active] text-[11px] font-bold text-white"
              title={userLabel || "Admin"}
            >
              {initials}
            </div>
            {showCollapseToggle && onToggleCollapsed ? (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="rounded-lg p-1.5 text-[--sidebar-muted] transition-colors hover:bg-[--sidebar-hover] hover:text-[--sidebar-fg]"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 rounded-lg px-1 py-1.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[--sidebar-active] text-[11px] font-bold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-[--sidebar-fg]">{userLabel || "Admin"}</p>
                <p className="text-[10px] text-[--sidebar-muted]">Administrator</p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg p-1.5 text-[--sidebar-muted] transition-colors hover:bg-[--sidebar-hover] hover:text-red-500"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            {showCollapseToggle && onToggleCollapsed ? (
              <div className="flex justify-end px-1">
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  className="rounded-lg border border-[--sidebar-border] bg-white p-1.5 text-[--sidebar-muted] transition-colors hover:bg-[--sidebar-hover] hover:text-[--sidebar-fg]"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ) : null}
          </div>
        )}
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
  const initials = userInitials(userLabel);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-white px-3 shadow-sm sm:gap-4 sm:px-4">
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
          <ShaleanNavLogo className="h-7 w-auto max-w-[104px] sm:h-8 sm:max-w-[148px]" intrinsicHeight={120} />
        </Link>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-slate-50 text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/20 sm:w-56 sm:justify-start sm:gap-2 sm:px-3"
          onClick={onCommandPalette}
          aria-label="Search (Cmd+K)"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate text-left text-sm sm:inline">Search...</span>
          <kbd className="hidden shrink-0 rounded-md border border-border bg-white px-1.5 py-0.5 text-[10px] font-medium leading-none sm:inline-flex">
            ⌘K
          </kbd>
        </button>

        <Link
          href="/office/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/20"
          aria-label={
            unreadNotifications > 0 ? `Open notifications, ${unreadNotifications} unread` : "Open notifications"
          }
        >
          <Bell className="h-5 w-5" />
          {unreadNotifications > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {notificationBadge}
            </span>
          ) : null}
        </Link>

        <button
          type="button"
          onClick={onLogout}
          className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted sm:px-2"
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
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]"
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
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted"
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
