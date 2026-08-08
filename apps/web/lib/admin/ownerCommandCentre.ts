import {
  hasAnyOfficePermission,
  inferOfficeRole,
  policyForOfficePath,
} from "@/lib/admin/officeExperience";

export const OWNER_COMMAND_CENTRE_SOURCES = {
  revenueTodayZar:
    "fetchAdminDashboardRevenueSummary → revenueTodayZar (payment_completed_at / cash-in day, not visit date)",
  revenueMonthZar:
    "fetchAdminDashboardRevenueSummary → revenueMonthZar (payment_completed_at / cash-in day)",
  completedBookingsToday: "computeOfficeTodayScheduleStats → completed (visit date = today JHB)",
  grossMarginCents:
    "loadFinancialDashboard → profit.gross_margin_cents (completed-visit revenue − trusted cleaner costs)",
  netOperatingPositionCents: "loadFinancialDashboard → profit.net_profit_cents",
  previousMonthComparisonPct: "loadFinancialDashboard → summary_cards.revenue_growth_percent",
  cashReceivedMonthCents: "loadCashFlowDashboard → summary.money_received_cents (period payment collections)",
  outstandingCustomerPaymentsCents:
    "loadFinancialDashboard → executive_kpis.outstanding_customer_payments_cents",
  approvedExpensesCents: "sumApprovedExpensesInRange for current month (approved expenses only)",
  cleanerLiabilitiesCents: "loadFinancialDashboard → executive_kpis.pending_cleaner_payouts_cents",
  netCashPositionCents:
    "loadCashFlowDashboard → summary.cash_in_bank_cents + summary.petty_cash_cents",
  pendingApprovalAmountCents: "listMoneyActionProposals (status=pending) → sum proposed_total_cents",
  eligiblePayoutAmountCents: "GET /api/admin/payouts/eligible → sum total_cents by cleaner",
  pendingProposalCount: "listMoneyActionProposals (status=pending) → total",
  overdueApprovalCount: "listMoneyActionProposals pending rows with expires_at < now",
  criticalAuditAlerts: "admin_audit_events where event_type ilike %critical% or %denied% (7d)",
  recentPermissionChanges:
    "admin_audit_events where event_type contains permission|role|assignment (7d)",
  failedLoginAlerts: "Not available — no failed-login audit source is exposed",
  pendingAccessReviews: "Not available — no access-review queue source is exposed",
  todayVisitRevenueZar:
    "computeOfficeVisitDayFinance → completedPaidValueZar (visit-date completed paid revenue)",
  todayCleanerEarningsCents:
    "loadOfficePayoutPeriodReport(today, today) → totals.earned_cents (excludes incomplete team earnings from trusted rollups where report enforces it)",
  todayEstimatedGrossProfitCents:
    "loadOfficePayoutPeriodReport(today, today) → company_earnings_cents when earned totals are trusted; null when incomplete",
  todayExceptionCount: "computeOpsSnapshotFromRows → slaBreaches + unassignedPastDue",
  customerSummary: "office-analytics kpis + customers table active count",
  workforceSummary: "cleaners active roster counts",
  bookingServiceBreakdown: "office-analytics → servicePopularity",
  financialSummary: "loadFinancialDashboard profit + executive_kpis",
} as const;

export type OwnerKpiSourceKey = keyof typeof OWNER_COMMAND_CENTRE_SOURCES;
export type OwnerNullableNumber = number | null;
export type OwnerCommandCentreQuickAction = { id: string; label: string; href: string };

export const OWNER_QUICK_ACTIONS: OwnerCommandCentreQuickAction[] = [
  { id: "create-booking", label: "Create booking", href: "/office/bookings/create" },
  { id: "assign-teams", label: "Assign teams", href: "/office/bookings?filter=unassigned" },
  { id: "payout-approvals", label: "Review payout approvals", href: "/office/payouts/approvals" },
  { id: "profitability", label: "View profitability", href: "/office/booking-profitability" },
  { id: "cash-flow", label: "View cash flow", href: "/office/cash-flow" },
  { id: "system-health", label: "Review system health", href: "/office/ops-health" },
];

export type OwnerCommandCentrePayload = {
  ok: true;
  generatedAt: string;
  sources: typeof OWNER_COMMAND_CENTRE_SOURCES;
  businessHealth: { revenueTodayZar: OwnerNullableNumber; revenueMonthZar: OwnerNullableNumber; completedBookingsToday: OwnerNullableNumber; grossMarginCents: OwnerNullableNumber; netOperatingPositionCents: OwnerNullableNumber; previousMonthComparisonPct: OwnerNullableNumber };
  cashFlow: { cashReceivedMonthCents: OwnerNullableNumber; outstandingCustomerPaymentsCents: OwnerNullableNumber; approvedExpensesCents: OwnerNullableNumber; cleanerLiabilitiesCents: OwnerNullableNumber; netCashPositionCents: OwnerNullableNumber };
  payoutApprovals: { pendingApprovalAmountCents: OwnerNullableNumber; eligibleAmountCents: OwnerNullableNumber; pendingProposalCount: OwnerNullableNumber; overdueApprovalCount: OwnerNullableNumber };
  security: { criticalAuditAlerts: OwnerNullableNumber; recentPermissionChanges: OwnerNullableNumber; failedLoginAlerts: OwnerNullableNumber; pendingAccessReviews: OwnerNullableNumber };
  todaySnapshot: { totalBookings: OwnerNullableNumber; completed: OwnerNullableNumber; inProgress: OwnerNullableNumber; pendingOrUnallocated: OwnerNullableNumber; cancelled: OwnerNullableNumber; revenueZar: OwnerNullableNumber; cleanerEarningsCents: OwnerNullableNumber; estimatedGrossProfitCents: OwnerNullableNumber; lateOrExceptionCount: OwnerNullableNumber };
  summaries: {
    customers: { retentionPct: OwnerNullableNumber; totalBookingsWindow: OwnerNullableNumber; avgBookingValueZar: OwnerNullableNumber };
    workforce: { activeCleaners: OwnerNullableNumber; availableToday: OwnerNullableNumber; pendingApplications: OwnerNullableNumber };
    bookingServices: Array<{ label: string; count: number; revenueZar: number | null }>;
    financial: { customerRevenueCents: OwnerNullableNumber; grossMarginCents: OwnerNullableNumber; netProfitCents: OwnerNullableNumber; outstandingCustomerPaymentsCents: OwnerNullableNumber };
  };
  sectionErrors: Partial<Record<"businessHealth" | "cashFlow" | "payoutApprovals" | "security" | "todaySnapshot" | "summaries", string>>;
};

export function canAccessOwnerCommandCentre(permissions: ReadonlySet<string> | readonly string[]): boolean {
  return inferOfficeRole(permissions) === "owner";
}

export function ownerQuickActionsForPermissions(permissions: ReadonlySet<string>): OwnerCommandCentreQuickAction[] {
  return OWNER_QUICK_ACTIONS.filter((action) => {
    const policy = policyForOfficePath(action.href.split("?")[0]!);
    return Boolean(policy && hasAnyOfficePermission(permissions, policy.anyOf));
  });
}

export function formatOwnerZarFromCents(cents: OwnerNullableNumber): string {
  if (cents == null || !Number.isFinite(cents)) return "Not available";
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}
export function formatOwnerZar(value: OwnerNullableNumber): string {
  if (value == null || !Number.isFinite(value)) return "Not available";
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}
export function formatOwnerCount(value: OwnerNullableNumber): string {
  if (value == null || !Number.isFinite(value)) return "Not available";
  return Math.round(value).toLocaleString("en-ZA");
}
export function formatOwnerPct(value: OwnerNullableNumber): string {
  if (value == null || !Number.isFinite(value)) return "Not available";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 10) / 10}%`;
}

export function emptyOwnerCommandCentreSections(): Pick<OwnerCommandCentrePayload, "businessHealth" | "cashFlow" | "payoutApprovals" | "security" | "todaySnapshot" | "summaries"> {
  return {
    businessHealth: { revenueTodayZar: null, revenueMonthZar: null, completedBookingsToday: null, grossMarginCents: null, netOperatingPositionCents: null, previousMonthComparisonPct: null },
    cashFlow: { cashReceivedMonthCents: null, outstandingCustomerPaymentsCents: null, approvedExpensesCents: null, cleanerLiabilitiesCents: null, netCashPositionCents: null },
    payoutApprovals: { pendingApprovalAmountCents: null, eligibleAmountCents: null, pendingProposalCount: null, overdueApprovalCount: null },
    security: { criticalAuditAlerts: null, recentPermissionChanges: null, failedLoginAlerts: null, pendingAccessReviews: null },
    todaySnapshot: { totalBookings: null, completed: null, inProgress: null, pendingOrUnallocated: null, cancelled: null, revenueZar: null, cleanerEarningsCents: null, estimatedGrossProfitCents: null, lateOrExceptionCount: null },
    summaries: {
      customers: { retentionPct: null, totalBookingsWindow: null, avgBookingValueZar: null },
      workforce: { activeCleaners: null, availableToday: null, pendingApplications: null },
      bookingServices: [],
      financial: { customerRevenueCents: null, grossMarginCents: null, netProfitCents: null, outstandingCustomerPaymentsCents: null },
    },
  };
}
