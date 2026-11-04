/** Evidence-backed fixture markers only. Never infer Paystack settlement from this classification. */
export type FunnelRevenueFixtureRow = {
  is_test?: boolean | null;
  booking_source?: string | null;
  customer_name?: string | null;
};

export function isExplicitFunnelRevenueFixture(booking: FunnelRevenueFixtureRow): boolean {
  return booking.is_test === true ||
    (booking.booking_source === "sales_document" &&
      booking.customer_name?.trim().toUpperCase() === "STAGING R550 CONVERSION TEST");
}
