import { Badge } from "@/components/ui/badge";
import { customerBookingCardOperationalDisplay } from "@/lib/dashboard/customerBookingDisplay";
import type { DashboardBooking } from "@/lib/dashboard/types";

export function CustomerBookingStatusBadge({ booking }: { booking: DashboardBooking }) {
  const { statusLabel: label, displayBadge, displayTone, operationalPhase, lifecycleSource } =
    customerBookingCardOperationalDisplay(booking);
  const title = `${displayBadge} · ${operationalPhase}`;
  switch (label) {
    case "Completed":
      return (
        <Badge variant="success" data-lifecycle-source={lifecycleSource} data-display-tone={displayTone} title={title}>
          {label}
        </Badge>
      );
    case "Completed (billed monthly)":
      return (
        <Badge
          variant="success"
          data-lifecycle-source={lifecycleSource}
          data-display-tone={displayTone}
          title={title}
          className="border border-emerald-300/80 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
        >
          {label}
        </Badge>
      );
    case "Cancelled":
    case "Failed":
      return (
        <Badge variant="destructive" data-lifecycle-source={lifecycleSource} data-display-tone={displayTone} title={title}>
          {label}
        </Badge>
      );
    case "Billed monthly":
      return (
        <Badge
          variant="outline"
          data-lifecycle-source={lifecycleSource}
          data-display-tone={displayTone}
          title={title}
          className="border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200"
        >
          {label}
        </Badge>
      );
    case "Scheduled":
    default:
      return (
        <Badge variant="default" data-lifecycle-source={lifecycleSource} data-display-tone={displayTone} title={title}>
          {label}
        </Badge>
      );
  }
}
