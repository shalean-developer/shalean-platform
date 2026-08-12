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

function isPublishingMarketingAction(path: string): boolean {
  return /(?:^|\/)(?:publish|send|activate|launch|schedule|sync|post)(?:\/|$)/.test(path);
}

/**
 * Priority 1/2 compatibility map for legacy Office routes.
 *
 * Reads may legitimately be shared by multiple operational roles. Mutations
 * must never be authorized by a read-only permission: write mappings therefore
 * return only permissions that carry explicit change authority for that domain.
 */
export function priorityPermissionsForRequest(request: Request): AdminPermission[] {
  const { pathname } = new URL(request.url);
  const path = pathname.toLowerCase();
  const method = request.method.toUpperCase();
  const read = method === "GET" || method === "HEAD";

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
  if (path.includes("/money-action-proposals")) {
    if (path.includes("/approve")) return ["payout.approve"];
    if (path.includes("/reject")) return ["payout.approve"];
    return read ? ["finance.full.view"] : ["payout.prepare"];
  }
  if (path.includes("/cleaner-earnings-disputes") || path.includes("/disputes")) {
    return ["dispute.resolve"];
  }
  if (path.includes("/payout") || path.includes("/earnings") || path.includes("/disbursement")) {
    return [payoutPermission(path, method)];
  }
  if (path.includes("/cleaners/") && (path.includes("/bank") || path.includes("/payment-details"))) {
    return ["cleaner.bank.view"];
  }
  if (path.includes("/cleaners/") && (path.includes("/identity") || path.includes("/documents"))) {
    return ["cleaner.documents.view"];
  }

  if (path.includes("/invoices") || path.includes("/billing-documents") || path.includes("/sales-documents")) {
    if (path.includes("/refund")) return ["refund.approve.high"];
    if (
      path.includes("/reconcile") ||
      path.includes("/sync-payment") ||
      path.includes("/mark-paid") ||
      path.includes("/hard-close") ||
      path.includes("/repair-")
    ) return ["payment.reconcile"];
    return ["invoice.manage"];
  }

  if (path.includes("/inventory")) {
    return read ? ["expense.manage", "booking.assign", "finance.full.view"] : ["expense.manage", "booking.assign"];
  }
  if (path.includes("/transport")) {
    return read ? ["booking.assign", "booking.view", "expense.manage", "finance.full.view"] : ["booking.assign", "expense.manage"];
  }
  if (
    path.includes("/office-notifications") ||
    path.includes("/notification-logs") ||
    path.includes("/notifications/")
  ) {
    return read
      ? ["system.notifications", "notification.send", "system.logs"]
      : ["notification.send"];
  }
  if (path.includes("/email/health")) return ["system.notifications"];
  if (path.includes("/whatsapp-test")) return ["notification.send"];

  if (path.includes("/customer-care-cases")) {
    return read ? ["customer.view", "customer.contact", "incident.manage"] : ["customer.contact", "incident.manage"];
  }
  if (
    path.includes("/customers") ||
    path.includes("/addresses") ||
    path.includes("/customer-saved-addresses")
  ) {
    return read ? ["customer.view"] : ["customer.edit"];
  }

  if (path.includes("/quality/inspections")) {
    return read ? ["cleaner.view", "incident.manage"] : ["incident.manage"];
  }
  if (
    path.includes("/cleaner-applications") ||
    path.includes("/cleaner-change-requests")
  ) return read ? ["cleaner.view"] : ["application.decide", "cleaner.edit"];
  if (path.includes("/cleaners")) return read ? ["cleaner.view"] : ["cleaner.edit"];
  if (path.includes("/email-operations")) {
    return read
      ? ["system.notifications", "notification.send"]
      : ["notification.send"];
  }
  if (path.includes("/lifecycle-email")) {
    return read
      ? ["notification.send", "template.manage"]
      : ["notification.send", "template.manage"];
  }
  if (path.includes("/templates")) {
    return ["template.manage"];
  }
  if (
    path.includes("/ops-health") ||
    path.includes("/cron-health") ||
    path.includes("/office-ops-health") ||
    path.includes("/launch-check") ||
    path.includes("/sla-breaches") ||
    path.includes("/ops-queue") ||
    path.includes("/metrics") ||
    path.includes("/operations") ||
    path.includes("/office-operations") ||
    path.includes("/ops-snapshot")
  ) {
    return read
      ? ["ops.health.view", "incident.manage"]
      : ["incident.manage"];
  }

  if (path.includes("/pricing-catalog-audit")) return ["pricing.manage"];
  if (path.includes("/workforce/training-compliance")) {
    return read ? ["cleaner.view"] : ["cleaner.edit"];
  }

  if (
    path === "/api/admin/cleaners" ||
    path.includes("/cleaner-report-feedback") ||
    path.includes("/cleaner-performance")
  ) {
    return read ? ["cleaner.view"] : ["cleaner.edit"];
  }
  if (path.includes("/reviews") || path.includes("/review-funnel")) {
    return read ? ["customer.view", "marketing.view"] : ["customer.contact"];
  }
  if (path.includes("/blog/")) {
    return read
      ? ["content.draft", "content.publish", "marketing.view"]
      : ["content.draft", "content.publish"];
  }
  if (path.includes("/campaign-template")) {
    return read
      ? ["template.manage", "content.draft", "marketing.view"]
      : ["template.manage", "content.draft"];
  }
  if (
    path.includes("/promotions") ||
    path.includes("/marketing-automation") ||
    path.includes("/social-accounts") ||
    path.includes("/memberships") ||
    path.includes("/referrals/") ||
    path.includes("/marketing/")
  ) {
    if (read) return ["marketing.view", "content.draft", "content.publish"];
    return isPublishingMarketingAction(path) ? ["content.publish"] : ["content.draft", "content.publish"];
  }

  if (path.includes("/seo") || path.includes("/conversion") || path.includes("/growth/")) {
    if (read) return ["marketing.view"];
    return isPublishingMarketingAction(path) ? ["content.publish"] : ["content.draft", "content.publish"];
  }

  if (path.includes("/whatsapp-inbox")) return ["customer.contact"];

  if (path.includes("/recurring") || path.includes("/bookings")) {
    if (path.includes("/refund")) return ["refund.approve.low", "refund.approve.high"];
    if (
      path.includes("/resend-confirmation") ||
      path.includes("/send-review-request") ||
      path.includes("/resend-payment-link")
    ) return ["notification.send"];
    if (path.includes("/assign") || path.includes("/roster") || path.includes("/cleaners")) {
      return ["booking.assign"];
    }
    return read ? ["booking.view"] : ["booking.edit"];
  }

  // Compatibility helpers must never turn an unknown admin route into generic
  // booking access. An empty policy is rejected by the canonical permission
  // resolver, so new/unmapped route families fail closed until classified.
  return [];
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
