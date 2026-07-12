import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAdminHtmlEmail } from "@/lib/email/sendBookingEmail";

export type NotifyOfficeSoftFulfillmentParams = {
  supabase: SupabaseClient;
  bookingId: string;
  kind: "ops_assignment" | "area_review";
  suburb?: string | null;
  dateYmd?: string | null;
  timeHm?: string | null;
  serviceSlug?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
};

/** Best-effort office alert for soft-fulfillment bookings. */
export async function notifyOfficeSoftFulfillment(
  params: NotifyOfficeSoftFulfillmentParams,
): Promise<void> {
  const title =
    params.kind === "area_review"
      ? "Area Review booking received"
      : "Pending Assignment (ops reserve) paid";
  const subject = `[Shalean Ops] ${title} — ${params.suburb ?? "Unknown suburb"}`;
  const lines = [
    `<p><strong>${title}</strong></p>`,
    `<p>Booking ID: <code>${params.bookingId}</code></p>`,
    `<p>Suburb: ${params.suburb ?? "—"}</p>`,
    `<p>Service: ${params.serviceSlug ?? "—"}</p>`,
    `<p>Requested: ${params.dateYmd ?? "—"} ${params.timeHm ?? ""}</p>`,
    `<p>Customer: ${params.customerName ?? "—"} / ${params.customerEmail ?? "—"} / ${params.customerPhone ?? "—"}</p>`,
    `<p><a href="/office/ops-queue">Open ops queue</a></p>`,
  ];
  try {
    await sendAdminHtmlEmail({
      subject,
      html: lines.join("\n"),
      context: { bookingId: params.bookingId, kind: params.kind },
    });
  } catch (e) {
    console.error("[notifyOfficeSoftFulfillment]", e);
  }
}
