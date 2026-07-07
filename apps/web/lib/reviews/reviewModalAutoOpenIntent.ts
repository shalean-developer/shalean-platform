/**
 * Pure decision function for whether the customer reviews modal should
 * auto-open and which booking it should pre-select.
 *
 * Extracted from {@link DashboardReviewsInner} so M-11's three rules can be
 * proven exhaustively without a React/DOM harness:
 *
 *   1. **Existing `?booking=<id>` behaviour is preserved.** When the URL
 *      carries an eligible booking id, that wins (back-compat with deep
 *      links the lifecycle email + dashboard CTA already produce).
 *
 *   2. **Exactly one reviewable booking auto-opens.** Customers landing on
 *      `/account/reviews` from a notification or top-nav with a single
 *      pending review get the modal opened on it directly — no extra click
 *      hunting through a dropdown.
 *
 *   3. **Multiple reviewable bookings never auto-open.** Picking the wrong
 *      one for the customer would silently funnel feedback to the
 *      not-yet-intended booking; the dropdown stays the explicit choice.
 *
 * Re-running the helper after the dialog has been opened (and possibly
 * dismissed by the customer) returns `kind: "none"` — `alreadyOpened`
 * latches the decision so a later refetch can never reopen the modal
 * underneath the customer.
 *
 * @module reviewModalAutoOpenIntent
 */

export type ReviewModalAutoOpenIntent =
  | { kind: "by_query"; bookingId: string }
  | { kind: "single_eligible"; bookingId: string }
  | { kind: "none" };

export type ReviewModalAutoOpenInputs = {
  /** Raw `?booking=` value from the URL — trim/normalisation handled here. */
  queryBookingId: string | null | undefined;
  /** Ordered list of booking ids the customer is eligible to review (post-filter). */
  reviewableIds: readonly string[];
  /** Latch — once `true`, no further auto-open decisions fire. */
  alreadyOpened: boolean;
  /** Bookings list still loading — wait until the eligibility set is final. */
  bookingsLoading: boolean;
  /** Existing-reviews list still loading — needed to subtract reviewed ids. */
  reviewsLoading: boolean;
};

export function chooseReviewModalAutoOpenIntent(
  inputs: ReviewModalAutoOpenInputs,
): ReviewModalAutoOpenIntent {
  if (inputs.alreadyOpened) return { kind: "none" };
  if (inputs.bookingsLoading || inputs.reviewsLoading) return { kind: "none" };

  const q = String(inputs.queryBookingId ?? "").trim();
  if (q && inputs.reviewableIds.some((id) => id === q)) {
    return { kind: "by_query", bookingId: q };
  }

  // M-11: single-eligible auto-open. Multiple eligible bookings deliberately
  // fall through to `none` — the dropdown stays the explicit choice so we
  // never funnel feedback to the wrong booking.
  if (inputs.reviewableIds.length === 1) {
    return { kind: "single_eligible", bookingId: inputs.reviewableIds[0]! };
  }

  return { kind: "none" };
}
