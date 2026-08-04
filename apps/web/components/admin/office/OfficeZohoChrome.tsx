"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

export function OfficeZohoPageHeader({
  title,
  subtitle,
  live,
  actions,
}: {
  title: string;
  subtitle?: string;
  live?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900 sm:text-[22px]">{title}</h1>
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
          {live ? <span className="h-2 w-2 rounded-full bg-emerald-500" title="Live data" /> : null}
        </div>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function OfficeZohoPrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-md bg-[var(--sidebar-active)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function OfficeZohoSecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function OfficeZohoMetricCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  onClick,
  active,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  value: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-[180px] flex-1 items-start gap-3 rounded-lg border bg-white px-4 py-3.5 text-left shadow-sm transition",
        active ? "border-[--sidebar-active] ring-1 ring-[--sidebar-active]/20" : "border-slate-200 hover:border-slate-300",
        onClick && "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[--sidebar-active]",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className="mt-0.5 block text-lg font-bold tabular-nums text-slate-900">{value}</span>
      </span>
    </Tag>
  );
}

export function OfficeZohoMetricsRow({
  children,
  meta,
}: {
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch xl:justify-between">
      <div className="flex flex-wrap gap-3">{children}</div>
      {meta ? (
        <div className="flex shrink-0 flex-col justify-center text-right text-xs text-slate-500 xl:min-w-[200px]">
          {meta}
        </div>
      ) : null}
    </div>
  );
}

export type OfficeZohoSegmentTab = {
  key: string;
  title: string;
  subtitle: string;
  badge?: number;
  badgeTone?: "warn" | "neutral";
};

export function OfficeZohoSegmentTabs({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: OfficeZohoSegmentTab[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      {tabs.map((tab, index) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative min-w-[160px] flex-1 px-4 py-3 text-left transition sm:min-w-[200px]",
              index > 0 && "border-l border-slate-200",
              active ? "bg-slate-50" : "hover:bg-slate-50/60",
            )}
          >
            <span className="flex items-center gap-2">
              {tab.badge != null && tab.badge > 0 ? (
                <span
                  className={cn(
                    "text-base font-bold tabular-nums",
                    tab.badgeTone === "warn" ? "text-red-600" : "text-slate-900",
                  )}
                >
                  {tab.badge}
                </span>
              ) : null}
              <span className={cn("block text-sm font-semibold", active ? "text-slate-900" : "text-slate-700")}>
                {tab.title}
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">{tab.subtitle}</span>
            {active ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--sidebar-active)]" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function OfficeZohoPillTabs({
  tabs,
  activeKey,
  onChange,
  trailing,
}: {
  tabs: { key: string; label: string; count?: number }[];
  activeKey: string;
  onChange: (key: string) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          const label =
            tab.count != null ? `${tab.label} (${tab.count.toLocaleString("en-ZA")})` : tab.label;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-[var(--sidebar-active)] text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}

export function OfficeZohoToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-[var(--sidebar-active)]" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

type PermissionPayload = { permissions?: string[] };

export function OfficeZohoTableShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { data } = useAdminData<PermissionPayload>("/api/admin/security/my-permissions");
  const canViewCustomerRevenue = data?.permissions?.includes("finance.customer_revenue.view") === true;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const applyVisibility = () => {
      root.querySelectorAll("table").forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th"));
        const amountIndex = headers.findIndex((header) => {
          const label = header.textContent?.trim().toLowerCase();
          return label === "amount" || label === "customer amount" || label === "customer revenue";
        });
        if (amountIndex < 0) return;

        table.querySelectorAll("tr").forEach((row) => {
          const cells = row.querySelectorAll<HTMLElement>("th, td");
          const cell = cells.item(amountIndex);
          if (cell) cell.style.display = canViewCustomerRevenue ? "" : "none";
        });
      });
    };

    applyVisibility();
    const observer = new MutationObserver(applyVisibility);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [canViewCustomerRevenue]);

  return (
    <div ref={rootRef} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {children}
    </div>
  );
}
