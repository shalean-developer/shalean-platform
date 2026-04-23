import type { NormalizedBookingStatus } from "@/lib/dashboard/types";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: NormalizedBookingStatus }) {
  switch (status) {
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "assigned":
      return <Badge variant="outline">Assigned</Badge>;
    case "in_progress":
      return <Badge variant="warning">In progress</Badge>;
    case "confirmed":
    default:
      return <Badge variant="default">Confirmed</Badge>;
  }
}
