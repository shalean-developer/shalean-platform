import { computeReviewPromptConversionRate } from "@/lib/reviews/reviewFunnelMetrics";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OfficeReviewFunnelRecentRequest = {
  id: string;
  customerLabel: string;
  bookingId: string | null;
  channel: string;
  sentAt: string;
  daysAgo: number;
  reviewed: boolean;
};

export type OfficeReviewFunnelSummary = {
  windowDays: number;
  completedJobs: number;
  promptsSent: number;
  promptClicks: number;
  reviewsSubmitted: number;
  conversionPct: number | null;
  clickThroughPct: number | null;
  recentRequests: OfficeReviewFunnelRecentRequest[];
};

function daysAgoFrom(iso: string, nowMs: number): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

export async function loadOfficeReviewFunnelSummary(
  admin: SupabaseClient,
  days = 30,
): Promise<OfficeReviewFunnelSummary> {
  const windowDays = Math.min(90, Math.max(7, days));
  const untilIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const sinceYmd = sinceIso.slice(0, 10);

  const [funnel, completedRes, promptEventsRes, reviewedBookingIdsRes] = await Promise.all([
    computeReviewPromptConversionRate(admin, sinceIso, untilIso),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("date", sinceYmd),
    admin
      .from("user_events")
      .select("id, created_at, payload, booking_id")
      .eq("event_type", "review_prompt_sent")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("reviews")
      .select("booking_id")
      .gte("created_at", sinceIso)
      .limit(5000),
  ]);

  const reviewedBookingIds = new Set(
    (reviewedBookingIdsRes.data ?? [])
      .map((r) => String((r as { booking_id?: string | null }).booking_id ?? "").trim())
      .filter(Boolean),
  );

  const nowMs = Date.now();
  const recentRequests: OfficeReviewFunnelRecentRequest[] = [];

  for (const raw of promptEventsRes.data ?? []) {
    const row = raw as {
      id?: string;
      created_at?: string;
      booking_id?: string | null;
      payload?: Record<string, unknown> | null;
    };
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    if (payload.sent !== true) continue;
    const bookingId = String(row.booking_id ?? payload.booking_id ?? "").trim() || null;
    const customerLabel =
      String(payload.customer_name ?? payload.customer_email ?? payload.customer_phone ?? "").trim() || "Customer";
    const channel = String(payload.channel ?? payload.via ?? "sms").trim() || "sms";
    recentRequests.push({
      id: String(row.id ?? `${bookingId ?? "evt"}-${row.created_at ?? ""}`),
      customerLabel,
      bookingId,
      channel: channel.charAt(0).toUpperCase() + channel.slice(1),
      sentAt: String(row.created_at ?? ""),
      daysAgo: daysAgoFrom(String(row.created_at ?? ""), nowMs),
      reviewed: bookingId ? reviewedBookingIds.has(bookingId) : false,
    });
    if (recentRequests.length >= 15) break;
  }

  return {
    windowDays,
    completedJobs: completedRes.count ?? 0,
    promptsSent: funnel.promptsSent,
    promptClicks: funnel.promptClicks,
    reviewsSubmitted: funnel.reviewsSubmitted,
    conversionPct: funnel.conversionRate != null ? Math.round(funnel.conversionRate * 10000) / 100 : null,
    clickThroughPct: funnel.clickThroughRate != null ? Math.round(funnel.clickThroughRate * 10000) / 100 : null,
    recentRequests,
  };
}
