import type { AdminPermission } from "@/lib/admin/requirePermission";
import { OFFICE_ACCESS_POLICIES, policyForOfficePath } from "@/lib/admin/officeExperience";

export type OfficeRoutePolicy = {
  path: string;
  permission: AdminPermission;
  risk: "critical" | "high";
};

/**
 * Compatibility registry for server code that expects a single primary permission.
 * Client page visibility and navigation use the complete any-of policy in officeExperience.ts.
 */
export const HIGH_RISK_OFFICE_ROUTES: OfficeRoutePolicy[] = OFFICE_ACCESS_POLICIES
  .filter((policy) =>
    policy.anyOf.some((permission) =>
      [
        "payout.view",
        "payout.approve",
        "finance.full.view",
        "finance.summary.view",
        "expense.manage",
        "invoice.manage",
        "payment.reconcile",
        "profit.view",
        "pricing.manage",
        "integration.manage",
        "role.manage",
        "user.manage",
      ].includes(permission),
    ),
  )
  .map((policy) => ({
    path: policy.path,
    permission: policy.anyOf[0]!,
    risk: policy.anyOf.some((permission) =>
      ["payout.approve", "finance.full.view", "profit.view", "pricing.manage", "integration.manage", "role.manage", "user.manage"].includes(permission),
    )
      ? "critical"
      : "high",
  }));

export function permissionForOfficePath(pathname: string): AdminPermission | null {
  return policyForOfficePath(pathname)?.anyOf[0] ?? null;
}
