export type BookingEmailPayload = {
  customerEmail: string;
  /** From snapshot when available — used for email greeting. */
  customerName?: string | null;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  /** Street / full address line (may include suburb). */
  location: string;
  /** Suburb only when known separately from address. */
  suburb?: string | null;
  /** Human-readable extras list, or empty when none. */
  extrasLabel?: string | null;
  /** Recurring plan summary, e.g. "Weekly · Mon, Wed". */
  recurringSummary?: string | null;
  /** Cleaner assignment status for customers (name or pending copy). */
  cleanerStatusLabel?: string | null;
  cleanerName: string | null;
  totalPaidZar: number;
  /**
   * Customer-facing payment reference (`PAY-…`).
   * Never the full Paystack charge reference.
   */
  paymentReference: string;
  /**
   * Customer-facing booking reference (`SHL-BK-…`).
   * Never a UUID.
   */
  bookingReference?: string | null;
  /** DB booking id for detail links only (never shown as the booking ref). */
  bookingId?: string | null;
  /** True when checkout cleaner choice was not honored and another cleaner was assigned. */
  showCleanerSubstitutionNotice?: boolean;
  /** Machine-readable reason when substitution applies (e.g. invalid_cleaner_id). */
  fallbackReason?: string | null;
};
