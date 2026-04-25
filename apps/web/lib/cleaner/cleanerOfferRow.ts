/** Row from GET `/api/cleaner/offers` (pending dispatch offers). */
export type CleanerOfferRow = {
  id: string;
  booking_id: string;
  cleaner_id: string;
  status: string;
  expires_at: string;
  created_at: string;
  /** Server-assigned A/B cell; null on legacy rows. */
  ux_variant?: string | null;
  displayEarningsCents?: number | null;
  booking: {
    id: string;
    service: string | null;
    date: string | null;
    time: string | null;
    location: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    status: string | null;
    total_paid_zar?: number | null;
  } | null;
};
