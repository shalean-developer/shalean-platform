import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultFromAddress } from "@/lib/email/resendFrom";
import { safeResendSend } from "@/lib/email/safeResendSend";
import { isCustomerOutboundPaused } from "@/lib/notifications/customerOutboundPause";
import {
  releaseNotificationIdempotencyClaim,
  tryClaimNotificationIdempotency,
} from "@/lib/notifications/notificationIdempotencyClaim";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type RefundNotificationEntityType = "booking" | "monthly_invoice" | "sales_document";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function money(amountCents: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: currencyCode || "ZAR",
    minimumFractionDigits: 2,
  }).format(Math.max(0, amountCents) / 100);
}

async function resolveRecipient(
  admin: SupabaseClient,
  entityType: RefundNotificationEntityType,
  entityId: string,
): Promise<{ email: string; customerId: string | null; bookingId: string | null }> {
  if (entityType === "booking") {
    const { data } = await admin
      .from("bookings")
      .select("customer_email, customer_id")
      .eq("id", entityId)
      .maybeSingle();
    return {
      email: String(data?.customer_email ?? "").trim().toLowerCase(),
      customerId: data?.customer_id ? String(data.customer_id) : null,
      bookingId: entityId,
    };
  }

  if (entityType === "sales_document") {
    const { data } = await admin
      .from("sales_documents")
      .select("customer_email, customer_id")
      .eq("id", entityId)
      .maybeSingle();
    return {
      email: String(data?.customer_email ?? "").trim().toLowerCase(),
      customerId: data?.customer_id ? String(data.customer_id) : null,
      bookingId: null,
    };
  }

  const { data } = await admin
    .from("monthly_invoices")
    .select("customer_id")
    .eq("id", entityId)
    .maybeSingle();
  const customerId = data?.customer_id ? String(data.customer_id) : null;
  if (!customerId) return { email: "", customerId: null, bookingId: null };
  const authAdmin = (admin as unknown as { auth?: { admin?: { getUserById?: (id: string) => Promise<{ data?: { user?: { email?: string | null } | null } }> } } }).auth?.admin;
  if (!authAdmin?.getUserById) return { email: "", customerId, bookingId: null };
  const result = await authAdmin.getUserById(customerId);
  return {
    email: String(result.data?.user?.email ?? "").trim().toLowerCase(),
    customerId,
    bookingId: null,
  };
}

/** Send one customer confirmation per canonical provider refund reference. */
export async function sendRefundConfirmationEmail(
  admin: SupabaseClient,
  params: {
    entityType: RefundNotificationEntityType;
    entityId: string;
    refundReference: string;
    amountCents: number;
    currencyCode?: string;
  },
): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const refundReference = params.refundReference.trim();
  if (!refundReference) return { sent: false, error: "missing_refund_reference" };

  const { paused } = await isCustomerOutboundPaused();
  if (paused) return { sent: false, error: "customer_outbound_paused" };

  const recipient = await resolveRecipient(admin, params.entityType, params.entityId);
  if (!recipient.email) {
    await reportOperationalIssue("warn", "refund_confirmation_email", "refund.customer_email_missing", {
      entityType: params.entityType,
      entityId: params.entityId,
      refundReference,
    });
    return { sent: false, error: "customer_email_missing" };
  }

  const claimParams = {
    reference: `refund:${refundReference}`,
    eventType: "refund_succeeded",
    channel: "email" as const,
    bookingId: recipient.bookingId,
  };
  const claimed = await tryClaimNotificationIdempotency(admin, claimParams);
  if (!claimed) return { sent: false, skipped: true };

  const currency = params.currencyCode ?? "ZAR";
  const amount = money(params.amountCents, currency);
  const result = await safeResendSend({
    from: getDefaultFromAddress(),
    to: recipient.email,
    subject: "Your Shalean refund has been processed",
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1f2937"><h2>Shalean<span style="color:#2563eb">.</span></h2><h1 style="font-size:22px">Refund processed</h1><p>We have processed your refund of <strong>${escapeHtml(amount)}</strong>.</p><p>Please allow your bank or card provider's normal processing time for the funds to appear.</p><p style="font-size:12px;color:#6b7280">Refund reference: ${escapeHtml(refundReference)}</p><p style="font-size:12px;color:#9ca3af">Shalean Cleaning Services</p></div>`,
    context: {
      bookingId: recipient.bookingId,
      customerId: recipient.customerId,
      messageType: "refund_succeeded",
    },
  });

  if (result.error) {
    await releaseNotificationIdempotencyClaim(admin, claimParams);
    await reportOperationalIssue("warn", "refund_confirmation_email", result.error.message, {
      entityType: params.entityType,
      entityId: params.entityId,
      refundReference,
    });
    return { sent: false, error: result.error.message };
  }

  return { sent: true };
}
