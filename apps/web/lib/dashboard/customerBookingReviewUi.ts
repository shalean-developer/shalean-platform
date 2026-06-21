import type { DashboardBooking } from "@/lib/dashboard/types";
import { isDashboardBookingAuthoritativelyCompleted } from "@/lib/dashboard/dashboardBookingOperational";
import { bookingIsReviewSubmissionEligibleAssignee } from "@/lib/reviews/customerReviewFollowUpContract";

/** Completed visit the customer can still rate (solo or team lead). */
export function isBookingPendingCustomerReview(
  booking: DashboardBooking,
  reviewedIds: ReadonlySet<string>,
): boolean {
  return (
    isDashboardBookingAuthoritativelyCompleted(booking) &&
    bookingIsReviewSubmissionEligibleAssignee(booking.raw) &&
    !reviewedIds.has(booking.id)
  );
}

export function leaveReviewHrefForBooking(
  booking: DashboardBooking,
  reviewedIds: ReadonlySet<string>,
  revLoading: boolean,
): string | null {
  if (revLoading) return null;
  if (!isBookingPendingCustomerReview(booking, reviewedIds)) return null;
  return `/review?booking=${encodeURIComponent(booking.id)}`;
}
