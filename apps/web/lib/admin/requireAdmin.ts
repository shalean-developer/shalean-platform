import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  requireAnyAdminPermissionFromRequest,
  type AdminPermission,
} from "@/lib/admin/requirePermission";

export type AdminAuthResult =
  | { ok: true; user: User; email: string }
  | { ok: false; response: NextResponse };

function hasReleaseActionSegment(path: string): boolean {
  return /(?:^|\/)(?:pay|process|disburse|mark-paid|retry)(?:\/|$)/.test(path);
}

function payoutPermission(pathname: string, method: string): AdminPermission {
  const path = pathname.toLowerCase();
  const write = method !== "GET" && method !== "HEAD";
  if (path.includes("/approve")) return "payout.approve";
  if (hasReleaseActionSegment(path)) return "payout.release";
  if (
    write ||
    path.includes("/generate") ||
    path.includes("/freeze") ||
    path.includes("/recalculate") ||
    path.includes("/backfill") ||
    path.includes("/adjust") ||
    path.includes("/reset") ||
    path.includes("/fix-") ||
    path.includes("/amount")
  ) return "payout.prepare";
  return "payout.view";
}

/**
 * Priority 1/2 compatibility map for legacy Office routes.
 *
 * The returned list mirrors the page policy: mixed-purpose pages may be used
 * by more than one legitimate role, while critical resources remain protected
 * by their dedicated permission.
 */
export function priorityPermissionsForRequest(request: Request): AdminPermission[] {
  const { pathname } = new URL(request.url);
  const path = pathname.toLowerCase();
  const method = request.method.toUpperCase();

  if (path.includes("/api/admin/security/") || path.includes("/api/admin/roles") || path.includes("/api/admin/admin-users")) {
    return ["role.manage"];
  }
  if (
    path.includes("/financial-dashboard") ||
    path.includes("/business-health") ||
    path.includes("/cash-flow") ||
    path.includes("/expenses") ||
    path.includes("/recurring-expenses") ||
    path.includes("/budgets") ||
    path.includes("/expense-vendors") ||
    path.includes("/expense-reports") ||
    path.includes("/payment-reconciliation") ||
    path.includes("/booking-profitability")
  ) return ["finance.full.view"];
  if (path.includes("/payout") || path.includes("/earnings") || path.includes("/disbursement")) {
    return [payoutPermission(path, method)];
  }
  if (path.includes("/cleaners/") && (path.includes("/bank") || path.includes("/payment-details"))) {
    return ["cleaner.bank.view"];
  }
  if (path.includes("/cleaners/") && (path.includes("/identity") || path.includes("/documents"))) {
    return ["cleaner.documents.view"];
  }

  if (
    path === "/api/admin/cleaners" ||
    path.includes("/cleaner-report-feedback") ||
    path.includes("/cleaner-performance")
  ) {
    return method === "GET" || method === "HEAD" ? ["cleaner.view"] : ["cleaner.edit"];
  }
  if (path.includes("/reviews") || path.includes("/review-funnel")) {
    return ["customer.view", "marketing.view"];
  }
  if (path.includes("/blog/")) {
    return method === "GET" || method === "HEAD"
      ? ["content.draft", "content.publish", "marketing.view"]
      : ["content.draft", "content.publish"];
  }
  if (path.includes("/campaign-template")) {
    return ["template.manage", "content.draft", "marketing.view"];
  }
  if (
    path.includes("/promotions") ||
    path.includes("/marketing-automation") ||
    path.includes("/social-accounts") ||
    path.includes("/memberships") ||
    path.includes("/referrals/") ||
    path.includes("/marketing/")
  ) {
    return method === "GET" || method === "HEAD"
      ? ["marketing.view", "content.draft", "content.publish"]
      : ["content.publish", "marketing.view"];
  }

  return ["booking.view"];
}

/** Backwards-compatible single-permission accessor used by existing tests. */
export function priorityOnePermissionForRequest(request: Request): AdminPermission {
  return priorityPermissionsForRequest(request)[0];
}

/** Validates a bearer session against any permission allowed for the route. */
export async function requireAdminFromRequest(request: Request): Promise<AdminAuthResult> {
  const auth = await requireAnyAdminPermissionFromRequest(
    request,
    priorityPermissionsForRequest(request),
  );
  if (!auth.ok) return auth;
  return { ok: true, user: auth.user, email: auth.email };
}
