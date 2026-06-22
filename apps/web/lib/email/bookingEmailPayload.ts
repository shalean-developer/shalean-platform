export type BookingEmailPayload = {
  customerEmail: string;
  /** From snapshot when available — used for email greeting. */
  customerName?: string | null;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  cleanerName: string | null;
  totalPaidZar: number;
  paymentReference: string;
  /** DB booking id for links / admin copy (optional). */
  bookingId?: string | null;
  /** True when checkout cleaner choice was not honored and another cleaner was assigned. */
  showCleanerSubstitutionNotice?: boolean;
  /** Machine-readable reason when substitution applies (e.g. invalid_cleaner_id). */
  fallbackReason?: string | null;
};
