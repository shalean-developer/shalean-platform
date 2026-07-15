export type CustomerMonthlyInvoiceRow = {
  id: string;
  customer_id: string;
  month: string;
  total_bookings: number;
  total_amount_cents: number;
  amount_paid_cents: number;
  balance_cents: number | null;
  status: string;
  due_date: string;
  payment_link?: string | null;
  paystack_reference?: string | null;
  sent_at: string | null;
  finalized_at: string | null;
  is_overdue: boolean;
  is_closed: boolean;
  currency_code: string;
  created_at: string;
  updated_at: string;
  /** Zoho Books invoice id when synced; enables customer PDF download. */
  zoho_invoice_id?: string | null;
};
