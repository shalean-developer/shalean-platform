/**
 * Shapes returned by existing `GET /api/dashboard/summary`.
 * Display fields only — server owns booking logic.
 */

export type DashboardBookingStatus = string;

export type DashboardBookingSummary = {
  id: string;
  serviceName: string;
  date: string;
  time: string;
  addressLine: string;
  suburb: string;
  priceZar: number;
  status: DashboardBookingStatus;
  durationHours: number | null;
  scheduleConfirmed?: boolean;
  cleaner: { name: string; initials: string; phone?: string } | null;
  scheduledAt: string;
  createdAt: string;
};

export type DashboardInvoiceSummary = {
  id: string;
  month: string;
  total_amount_cents: number;
  amount_paid_cents: number;
  balance_cents: number | null;
  status: string;
  due_date: string;
  is_overdue?: boolean;
  payment_link?: string | null;
};

export type DashboardSummaryPayload = {
  ym: string;
  bookingsThisMonthCount: number;
  hoursBookedThisMonth: number;
  completedThisMonthCount: number;
  totalSpentThisMonthCents: number;
  nextBooking: DashboardBookingSummary | null;
  recentBookings: DashboardBookingSummary[];
  perVisitInvoices: unknown[];
  invoiceThisMonth: DashboardInvoiceSummary | null;
  hasAnyInvoices: boolean;
  isOverdue: boolean;
  daysOverdue: number;
  hasOverdueInvoice: boolean;
};
