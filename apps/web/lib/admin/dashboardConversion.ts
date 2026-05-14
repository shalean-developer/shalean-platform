import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";

export type DashboardBookingEventRow = {
  session_id?: string | null;
  analytics_session_id?: string | null;
  step?: string | null;
  event_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DashboardUserEventRow = {
  event_type?: string | null;
  payload?: Record<string, unknown> | null;
};

export type AdminDashboardConversionSummary =
  | {
      available: true;
      conversionRatePct: number;
      funnelSessionsQuote: number;
      funnelSessionsPayment: number;
    }
  | {
      available: false;
      conversionRatePct: null;
      funnelSessionsQuote: null;
      funnelSessionsPayment: null;
      error: string;
    };

const DASHBOARD_USER_EVENT_TYPES = [
  ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED,
  ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED,
] as const;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bookingEventCorrelationId(row: DashboardBookingEventRow): string | null {
  const meta = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  return stringValue(row.analytics_session_id) ?? stringValue(meta.analytics_session_id) ?? stringValue(row.session_id);
}

function userEventCorrelationId(row: DashboardUserEventRow): string | null {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  return stringValue(payload.analytics_session_id) ?? stringValue(payload.booking_session_id) ?? stringValue(payload.session_id);
}

export function computeAdminDashboardConversionSummary(params: {
  bookingEvents: DashboardBookingEventRow[];
  userEvents?: DashboardUserEventRow[];
  bookingEventsError?: Pick<PostgrestError, "message"> | null;
  userEventsError?: Pick<PostgrestError, "message"> | null;
}): AdminDashboardConversionSummary {
  const errorMessages = [params.bookingEventsError?.message, params.userEventsError?.message].filter(
    (m): m is string => typeof m === "string" && m.trim().length > 0,
  );
  if (errorMessages.length > 0) {
    return {
      available: false,
      conversionRatePct: null,
      funnelSessionsQuote: null,
      funnelSessionsPayment: null,
      error: errorMessages.join("; "),
    };
  }

  const quoteViews = new Set<string>();
  const paymentReached = new Set<string>();

  for (const event of params.bookingEvents) {
    const sid = bookingEventCorrelationId(event);
    if (!sid) continue;
    if (event.event_type === "view" && event.step === "quote") quoteViews.add(sid);
    if ((event.event_type === "view" || event.event_type === "next") && event.step === "payment") {
      paymentReached.add(sid);
    }
  }

  for (const event of params.userEvents ?? []) {
    const sid = userEventCorrelationId(event);
    if (!sid) continue;
    if (event.event_type === ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED) quoteViews.add(sid);
    if (event.event_type === ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED) paymentReached.add(sid);
  }

  const denominator = quoteViews.size;
  return {
    available: true,
    conversionRatePct: denominator > 0 ? Math.round((paymentReached.size / denominator) * 1000) / 10 : 0,
    funnelSessionsQuote: quoteViews.size,
    funnelSessionsPayment: paymentReached.size,
  };
}

export async function fetchAdminDashboardConversionSummary(
  admin: SupabaseClient,
  sinceIso: string,
): Promise<AdminDashboardConversionSummary> {
  const [bookingEventsRes, userEventsRes] = await Promise.all([
    admin
      .from("booking_events")
      .select("session_id, analytics_session_id, step, event_type, metadata")
      .gte("created_at", sinceIso)
      .limit(25000),
    admin
      .from("user_events")
      .select("event_type, payload")
      .gte("created_at", sinceIso)
      .in("event_type", [...DASHBOARD_USER_EVENT_TYPES])
      .limit(50000),
  ]);

  return computeAdminDashboardConversionSummary({
    bookingEvents: (bookingEventsRes.data ?? []) as DashboardBookingEventRow[],
    userEvents: (userEventsRes.data ?? []) as DashboardUserEventRow[],
    bookingEventsError: bookingEventsRes.error,
    userEventsError: userEventsRes.error,
  });
}
