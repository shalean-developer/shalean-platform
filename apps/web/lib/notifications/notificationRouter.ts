/**
 * Canonical booking event → notification orchestration (scaffolding).
 *
 * Maps {@link CanonicalBookingEvent} to existing high-level notification flows over time.
 * Does not replace `notifyBookingEvent`, lifecycle jobs, or provider clients in this phase.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalBookingEvent } from "@/lib/booking/bookingEvents";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { dispatchBookingCancelledNotifications } from "@/lib/notifications/bookingCancelledNotifications";

export type RouteBookingNotificationEventContext = {
  admin: SupabaseClient;
};

export type NotificationRouterResult =
  | {
      ok: true;
      eventType: CanonicalBookingEvent["type"];
      bookingId: string;
      routed: boolean;
      routedTo: string[];
      skippedReason?: string;
    }
  | {
      ok: false;
      eventType: CanonicalBookingEvent["type"];
      bookingId: string;
      code: string;
      message: string;
      cause?: unknown;
    };

export function isBookingNotificationRouterEnabled(): boolean {
  return process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED?.trim() === "1";
}

/** When `BOOKING_COMPLETED_ROUTER_ENABLED=1`, `booking.completed` is recognized (still no duplicate sends). Default off. */
export function isBookingCompletedRouterEnabled(): boolean {
  return process.env.BOOKING_COMPLETED_ROUTER_ENABLED?.trim() === "1";
}

/**
 * Routes a canonical booking domain event toward notification workflows.
 *
 * Today:
 * - `booking.payment_succeeded` is intentionally a **no-op** — `finalizePaystackChargeSuccess` already notifies.
 * - `booking.completed` (when {@link isBookingCompletedRouterEnabled}) delegates to {@link notifyBookingEvent}
 *   (`type: "completed"`) using `ctx.admin`. Without `ctx.admin`, routing fails closed (`ok: false`).
 * - `booking.cancelled` (when {@link isBookingNotificationRouterEnabled}) delegates to cancellation dispatch.
 */
export async function routeBookingNotificationEvent(
  event: CanonicalBookingEvent,
  ctx?: RouteBookingNotificationEventContext,
): Promise<NotificationRouterResult> {
  const base = {
    eventType: event.type,
    bookingId: event.bookingId,
  } as const;

  switch (event.type) {
    case "booking.payment_succeeded":
      return {
        ok: true,
        ...base,
        routed: false,
        routedTo: [],
        skippedReason: "existing_finalize_flow_already_notifies",
      };
    case "booking.cancelled":
      if (!isBookingNotificationRouterEnabled()) {
        return {
          ok: true,
          ...base,
          routed: false,
          routedTo: [],
          skippedReason: "booking_notification_router_disabled",
        };
      }
      if (!ctx?.admin) {
        return {
          ok: false,
          ...base,
          code: "booking_cancelled_router_missing_admin_client",
          message: "routeBookingNotificationEvent(booking.cancelled) requires ctx.admin.",
        };
      }
      try {
        const reason =
          typeof event.metadata?.cancellationReason === "string" ? event.metadata.cancellationReason : null;
        const result = await dispatchBookingCancelledNotifications(ctx.admin, {
          bookingId: event.bookingId,
          cancellationReason: reason,
        });
        return {
          ok: true,
          ...base,
          routed: result.dispatched,
          routedTo: result.dispatched ? ["dispatchBookingCancelledNotifications"] : [],
          skippedReason: result.skippedReason,
        };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return {
          ok: false,
          ...base,
          code: "dispatch_booking_cancelled_threw",
          message,
          cause,
        };
      }
    case "booking.completed":
      if (!isBookingCompletedRouterEnabled()) {
        return {
          ok: true,
          ...base,
          routed: false,
          routedTo: [],
          skippedReason: "booking_completed_router_disabled",
        };
      }
      if (!ctx?.admin) {
        return {
          ok: false,
          ...base,
          code: "booking_completed_router_missing_admin_client",
          message: "routeBookingNotificationEvent(booking.completed) requires ctx.admin for notifyBookingEvent delegation.",
        };
      }
      try {
        await notifyBookingEvent({ type: "completed", supabase: ctx.admin, bookingId: event.bookingId });
        return {
          ok: true,
          ...base,
          routed: true,
          routedTo: ["notifyBookingEvent:completed"],
        };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return {
          ok: false,
          ...base,
          code: "notify_booking_event_completed_threw",
          message,
          cause,
        };
      }
    default:
      return {
        ok: true,
        ...base,
        routed: false,
        routedTo: [],
        skippedReason: "unsupported_booking_event_type",
      };
  }
}
