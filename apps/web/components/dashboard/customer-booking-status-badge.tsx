import { customerBookingCardOperationalDisplay } from "@/lib/dashboard/customerBookingDisplay";
import { operationalDisplayBadgeClassName } from "@/lib/booking/describeBookingOperationalState";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

/** Customer-only remap — keep admin/cleaner "Pending" semantics elsewhere. */
function customerFacingDisplayBadge(badge: string, booking: DashboardBooking): string {
  if (badge !== "Pending") return badge;
  if (booking.cleaner?.name?.trim()) return "Confirmed";
  return "Awaiting cleaner";
}

/**
 * Customer-facing operational status — same `displayBadge` / tone derivation as
 * admin {@link BookingCardStatusBadge} and cleaner dashboard lifecycle badges.
 */
export function CustomerBookingStatusBadge({
  booking,
  className,
}: {
  booking: DashboardBooking;
  className?: string;
}) {
  const { statusLabel, displayBadge, displayTone, operationalPhase, lifecycleSource } =
    customerBookingCardOperationalDisplay(booking);
  const label = customerFacingDisplayBadge(displayBadge, booking);
  const cls = operationalDisplayBadgeClassName(displayTone);
  const title = `${label} · ${operationalPhase} · ${statusLabel}`;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        cls,
        className,
      )}
      data-lifecycle-source={lifecycleSource}
      data-display-tone={displayTone}
      data-operational-phase={operationalPhase}
      title={title}
    >
      {label}
    </span>
  );
}
