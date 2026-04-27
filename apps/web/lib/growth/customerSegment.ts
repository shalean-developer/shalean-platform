import "server-only";

export type CustomerMarketingSegment = "new" | "repeat" | "loyal" | "churned";

export type SegmentCustomerInput = {
  bookingCount: number;
  retentionState: import("./customerRetention").CustomerRetentionState;
};

/**
 * Maps booking history + retention state to a marketing segment.
 */
export function segmentCustomer(customer: SegmentCustomerInput): CustomerMarketingSegment {
  if (customer.retentionState === "churned") return "churned";
  const n = Math.max(0, customer.bookingCount);
  if (n <= 1) return "new";
  if (n >= 6) return "loyal";
  return "repeat";
}
