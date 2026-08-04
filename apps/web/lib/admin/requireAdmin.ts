import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  requireAdminPermissionFromRequest,
  type AdminPermission,
} from "@/lib/admin/requirePermission";

export type AdminAuthResult =
  | { ok: true; user: User; email: string }
  | { ok: false; response: NextResponse };

function payoutPermission(pathname: string, method: string): AdminPermission {
  const path = pathname.toLowerCase();
  const write = method !== "GET" && method !== "HEAD";
  if (path.includes("/approve")) return "payout.approve";
  if (
    path.includes("/pay") ||
    path.includes("/process") ||
    path.includes("/disburse") ||
    path.includes("/mark-paid") ||
    path.includes("/retry")
  ) return "payout.release";
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
 * Priority 1 compatibility map for legacy Office routes.
 *
 * Existing routes can keep calling `requireAdminFromRequest` while critical
 * resources are migrated to granular deny-by-default permissions. Unknown
 * non-critical routes deliberately retain the temporary `booking.view`
 * compatibility floor until the full route-by-route migration is complete.
 */
export function priorityOnePermissionForRequest(request: Request): AdminPermission {
  const { pathname } = new URL(request.url);
  const path = pathname.toLowerCase();
  const method = request.method.toUpperCase();

  if (path.includes("/api/admin/security/") || path.includes("/api/admin/roles") || path.includes("/api/admin/admin-users")) {
    return "role.manage";
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
  ) return "finance.full.view";
  if (path.includes("/payout") || path.includes("/earnings") || path.includes("/disbursement")) {
    return payoutPermission(path, method);
  }
  if (path.includes("/cleaners/") && (path.includes("/bank") || path.includes("/payment-details"))) {
    return "cleaner.bank.view";
  }
  if (path.includes("/cleaners/") && (path.includes("/identity") || path.includes("/documents"))) {
    return "cleaner.documents.view";
  }

  return "booking.view";
}

/**
 * Validates a bearer session and resolves a granular permission. Critical
 * Priority 1 route groups no longer use an admin email allow-list.
 */
export async function requireAdminFromRequest(request: Request): Promise<AdminAuthResult> {
  const auth = await requireAdminPermissionFromRequest(
    request,
    priorityOnePermissionForRequest(request),
  );
  if (!auth.ok) return auth;
  return { ok: true, user: auth.user, email: auth.email };
}
