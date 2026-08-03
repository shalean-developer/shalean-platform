"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { AdminPermission } from "@/lib/admin/requirePermission";
import { getSupabaseSession } from "@/lib/supabase/browser";
import {
  OFFICE_NAV_ALL_ITEMS,
  OFFICE_NAV_MODULES,
  OFFICE_NAV_SECTIONS,
} from "./OfficeNav";

type PermissionResponse = {
  permissions?: string[];
};

const FINANCE_PERMISSION_BY_PATH: Record<string, AdminPermission> = {
  "/office/financial-dashboard": "finance.summary.view",
  "/office/business-health": "finance.summary.view",
  "/office/cash-flow": "finance.full.view",
  "/office/expenses": "expense.manage",
  "/office/recurring-expenses": "expense.manage",
  "/office/budgets": "finance.full.view",
  "/office/expense-vendors": "expense.manage",
  "/office/expense-reports": "finance.summary.view",
  "/office/payment-reconciliation": "payment.reconcile",
  "/office/booking-profitability": "profit.view",
  "/office/referral-finance": "finance.full.view",
  "/office/referral-reconciliation": "payment.reconcile",
  "/office/referral-fraud": "finance.full.view",
  "/office/payouts": "payout.view",
  "/office/payouts/approvals": "payout.approve",
  "/office/pricing": "pricing.manage",
  "/office/invoices": "invoice.manage",
  "/office/billing": "invoice.manage",
  "/office/zoho-integration": "integration.manage",
};

const financeModule = OFFICE_NAV_MODULES.find((module) => module.id === "finance");
const originalFinanceChildren = [...(financeModule?.children ?? [])];
const financeSection = OFFICE_NAV_SECTIONS.find((section) => section.title === "FINANCE");
const originalFinanceSectionItems = [...(financeSection?.items ?? [])];
const originalAllItems = [...OFFICE_NAV_ALL_ITEMS];

function requiredPermission(href: string): AdminPermission | null {
  if (href === "/office/payouts/approvals") return "payout.approve";
  return FINANCE_PERMISSION_BY_PATH[href] ?? null;
}

function isAllowed(href: string, permissions: ReadonlySet<string>): boolean {
  const permission = requiredPermission(href);
  return permission ? permissions.has(permission) : false;
}

function applyFinanceNavigationPermissions(permissions: ReadonlySet<string>) {
  if (financeModule) {
    financeModule.children = originalFinanceChildren.filter((item) => isAllowed(item.href, permissions));
  }

  if (financeSection) {
    financeSection.items = originalFinanceSectionItems.filter((item) => isAllowed(item.href, permissions));
  }

  OFFICE_NAV_ALL_ITEMS.splice(
    0,
    OFFICE_NAV_ALL_ITEMS.length,
    ...originalAllItems.filter((item) => item.section !== "Finance" || isAllowed(item.href, permissions)),
  );
}

export function OfficePermissionNavigationGate({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPermissions() {
      const session = await getSupabaseSession();
      const token = session?.access_token;
      if (!token) {
        if (active) setPermissions(new Set());
        return;
      }

      try {
        const response = await fetch("/api/admin/security/my-permissions", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) {
          if (active) setPermissions(new Set());
          return;
        }
        const payload = (await response.json()) as PermissionResponse;
        if (active) setPermissions(new Set(payload.permissions ?? []));
      } catch {
        if (active) setPermissions(new Set());
      }
    }

    void loadPermissions();
    return () => {
      active = false;
    };
  }, []);

  if (permissions === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading Office permissions…
      </div>
    );
  }

  applyFinanceNavigationPermissions(permissions);
  return children;
}
