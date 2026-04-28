import { Badge } from "@/components/ui/badge";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { customerBookingStatusLabel } from "@/lib/dashboard/customerBookingDisplay";

export function CustomerBookingStatusBadge({ booking }: { booking: DashboardBooking }) {
  const label = customerBookingStatusLabel(booking);
  switch (label) {
    case "Completed":
      return <Badge variant="success">{label}</Badge>;
    case "Completed (billed monthly)":
      return (
        <Badge variant="success" className="border border-emerald-300/80 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
          {label}
        </Badge>
      );
    case "Cancelled":
    case "Failed":
      return <Badge variant="destructive">{label}</Badge>;
    case "Billed monthly":
      return <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200">{label}</Badge>;
    case "Scheduled":
    default:
      return <Badge variant="default">{label}</Badge>;
  }
}
