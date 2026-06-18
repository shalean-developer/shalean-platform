import { customerBookingCardOperationalDisplay } from "@/lib/dashboard/customerBookingDisplay";
import { operationalDisplayBadgeClassName } from "@/lib/booking/describeBookingOperationalState";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

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
  const cls = operationalDisplayBadgeClassName(displayTone);
  const title = `${displayBadge} · ${operationalPhase} · ${statusLabel}`;

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
      {displayBadge}
    </span>
  );
}
