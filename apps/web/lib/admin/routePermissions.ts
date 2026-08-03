import type { AdminPermission } from "@/lib/admin/requirePermission";

export type OfficeRoutePolicy = {
  path: string;
  permission: AdminPermission;
  risk: "critical" | "high";
};

/**
 * Central registry for Phase 2 Office route enforcement.
 * More-specific paths must appear before broader prefixes.
 */
export const HIGH_RISK_OFFICE_ROUTES: OfficeRoutePolicy[] = [
  { path: "/office/payouts", permission: "payout.view", risk: "critical" },
  { path: "/office/payout-batches", permission: "payout.view", risk: "critical" },
  { path: "/office/cash-flow", permission: "finance.full.view", risk: "critical" },
  { path: "/office/budgets", permission: "finance.full.view", risk: "critical" },
  { path: "/office/booking-profitability", permission: "profit.view", risk: "critical" },
  { path: "/office/expenses", permission: "expense.manage", risk: "high" },
  { path: "/office/invoices", permission: "invoice.manage", risk: "high" },
  { path: "/office/reporting", permission: "finance.summary.view", risk: "high" },
  { path: "/office/pricing", permission: "pricing.manage", risk: "critical" },
  { path: "/office/integrations", permission: "integration.manage", risk: "critical" },
  { path: "/office/security", permission: "role.manage", risk: "critical" },
  { path: "/office/admin-users", permission: "user.manage", risk: "critical" },
];

export function permissionForOfficePath(pathname: string): AdminPermission | null {
  const match = HIGH_RISK_OFFICE_ROUTES.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return match?.permission ?? null;
}
