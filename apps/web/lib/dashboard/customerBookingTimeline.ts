import { customerBookingDetailOperationalPhase } from "@/lib/dashboard/customerBookingDisplay";
import {
  customerBookingDetailTimelineConfirmedDone,
  isDashboardBookingAuthoritativelyCompleted,
} from "@/lib/dashboard/dashboardBookingOperational";
import type { DashboardBooking } from "@/lib/dashboard/types";

export type CustomerBookingTimelineStep = { label: string; done: boolean; tone?: "danger" };

function paymentConfirmedForTimeline(b: DashboardBooking): boolean {
  const ps = String(b.raw.payment_status ?? "")
    .trim()
    .toLowerCase();
  return (
    ps === "success" ||
    ps === "pending_monthly" ||
    Boolean(String(b.raw.payment_completed_at ?? "").trim())
  );
}

/**
 * Customer booking detail lifecycle timeline — progressive steps from booked through completed.
 */
export function customerBookingTimelineForBooking(b: DashboardBooking): CustomerBookingTimelineStep[] {
  const phase = customerBookingDetailOperationalPhase(b);
  const raw = b.raw;

  if (phase === "cancelled") {
    return [
      { label: "Booked", done: true },
      { label: "Cancelled", done: true, tone: "danger" },
    ];
  }
  if (phase === "failed") {
    return [
      { label: "Booked", done: true },
      { label: "Failed", done: true, tone: "danger" },
    ];
  }

  const paymentConfirmed = paymentConfirmedForTimeline(b);
  const bookingConfirmed = customerBookingDetailTimelineConfirmedDone(b);
  const cleanerAssigned =
    Boolean(b.cleaner?.name?.trim()) ||
    phase === "accepted" ||
    phase === "assigned" ||
    phase === "travelling" ||
    phase === "active" ||
    phase === "completed";
  const enRoute =
    phase === "travelling" ||
    phase === "active" ||
    phase === "completed" ||
    Boolean(String(raw.en_route_at ?? "").trim());
  const cleaningStarted =
    phase === "active" ||
    phase === "completed" ||
    Boolean(String(raw.started_at ?? "").trim());
  const completed = phase === "completed" || isDashboardBookingAuthoritativelyCompleted(b);

  return [
    { label: "Booked", done: true },
    { label: "Payment Confirmed", done: paymentConfirmed },
    { label: "Booking Confirmed", done: bookingConfirmed },
    { label: "Cleaner Assigned", done: cleanerAssigned },
    { label: "Cleaner En Route", done: enRoute },
    { label: "Cleaning Started", done: cleaningStarted },
    { label: "Completed", done: completed },
  ];
}
