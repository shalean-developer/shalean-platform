"use client";

import Link from "next/link";
import { Calendar, HelpCircle, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type QuickAction = {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "schedule",
    label: "My schedule",
    href: "/jobs/list",
    icon: Calendar,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    id: "earnings",
    label: "Earnings",
    href: "/jobs/earnings",
    icon: Wallet,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
  },
  {
    id: "expenses",
    label: "Expenses",
    href: "/jobs/earnings",
    icon: Receipt,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  {
    id: "help",
    label: "Help & support",
    href: "/jobs/profile",
    icon: HelpCircle,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
  },
];

type QuickActionCardProps = {
  className?: string;
};

export function QuickActionCard({ className }: QuickActionCardProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        Quick Actions
      </h2>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              href={action.href}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-100 bg-white px-1 py-3.5 text-center shadow-sm transition-colors hover:bg-gray-50 active:scale-95"
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  action.iconBg,
                )}
              >
                <Icon
                  className={cn("size-5", action.iconColor)}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <span className="text-xs font-medium leading-tight text-slate-600">
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
