import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAdminDashboardRevenueSummary } from "@/lib/admin/dashboardRevenue";
import { computeOfficeVisitDayFinance } from "@/lib/admin/dashboardVisitDayFinance";
import { loadCashFlowDashboard } from "@/lib/admin/expenses/loadCashFlowDashboard";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";
import { loadFinancialDashboard } from "@/lib/admin/expenses/loadFinancialDashboard";
import {
  computeOfficeAnalyticsSummary,
  extractPriorCustomerIds,
  officeAnalyticsFetchStartIso,
  officeAnalyticsWindowFromParams,
  priorCustomerQueryEndIso,
  type OfficeAnalyticsBookingRow,
} from "@/lib/admin/officeAnalytics";
import { computeOfficeTodayScheduleStats } from "@/lib/admin/officeTodayScheduleStats";
import {
  computeOpsSnapshotFromRows,
  OPS_SNAPSHOT_BOOKING_SELECT,
  type OpsSnapshotRow,
} from "@/lib/admin/opsSnapshot";
import {
  emptyOwnerCommandCentreSections,
  OWNER_COMMAND_CENTRE_SOURCES,
  type OwnerCommandCentrePayload,
} from "@/lib/admin/ownerCommandCentre";
import {
  defaultOfficePayoutPeriodRange,
  loadOfficePayoutPeriodReport,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { listMoneyActionProposals } from "@/lib/payout/listMoneyActionProposals";

const ANALYTICS_BOOKING_SELECT =
  "id, created_at, updated_at, status, payment_status, payment_completed_at, total_paid_zar, amount_paid_cents, refunded_at, refund_status, billing_type, is_monthly_billing_booking, monthly_invoice_id, service, service_slug, customer_id, is_recurring_generated";

const SCHEDULE_BOOKING_SELECT =
  "id,date,time,status,cleaner_id,selected_cleaner_id,team_id,is_team_job,payment_status,payment_completed_at,payment_method,total_paid_zar,amount_paid_cents,total_price,refunded_at,refund_status,billing_type,is_monthly_billing_booking,monthly_invoice_id";

const PERMISSION_CHANGE_EVENT = /permission|role|assignment|grant|revoke/i;
const CRITICAL_AUDIT_EVENT = /critical|denied|forbidden|breach|security_alert/i;

async function loadEligiblePayoutCents(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "cleaner_id, payout_owner_cleaner_id, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents",
    )
    .eq("payout_status", "eligible");
  if (error) throw new Error(error.message);
  let total = 0;
  for (const row of data ?? []) {
    total +=
      resolveCleanerEarningsCents({
        cleaner_earnings_total_cents: row.cleaner_earnings_total_cents,
        payout_frozen_cents: row.payout_frozen_cents,
        display_earnings_cents: row.display_earnings_cents,
      }) ?? 0;
  }
  return total;
}

async function loadSecurityCounts(admin: SupabaseClient): Promise<{
  criticalAuditAlerts: number;
  recentPermissionChanges: number;
}> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await admin
    .from("admin_audit_events")
    .select("event_type")
    .gte("created_at", since)
    .limit(2000);
  if (error) throw new Error(error.message);

  let criticalAuditAlerts = 0;
  let recentPermissionChanges = 0;
  for (const row of data ?? []) {
    const eventType = String(row.event_type ?? "");
    if (CRITICAL_AUDIT_EVENT.test(eventType)) criticalAuditAlerts += 1;
    if (PERMISSION_CHANGE_EVENT.test(eventType)) recentPermissionChanges += 1;
  }
  return { criticalAuditAlerts, recentPermissionChanges };
}

async function loadTodayBookings(admin: SupabaseClient, today: string) {
  const { data, error } = await admin
    .from("bookings")
    .select(SCHEDULE_BOOKING_SELECT)
    .eq("date", today)
    .order("time", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadOpsExceptionCount(admin: SupabaseClient): Promise<number> {
  const rows: OpsSnapshotRow[] = [];
  const { data, error } = await admin
    .from("bookings")
    .select(OPS_SNAPSHOT_BOOKING_SELECT)
    .not("status", "in", "(completed,cancelled,failed,payment_expired)")
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  rows.push(...((data ?? []) as OpsSnapshotRow[]));
  const snap = computeOpsSnapshotFromRows(rows);
  return snap.slaBreaches + snap.unassignedPastDue;
}

export async function loadOwnerCommandCentre(
  admin: SupabaseClient,
  viewerUserId: string,
  now = new Date(),
): Promise<OwnerCommandCentrePayload> {
  const sections = emptyOwnerCommandCentreSections();
  const sectionErrors: OwnerCommandCentrePayload["sectionErrors"] = {};
  const today = todayYmdJohannesburg(now);
  const monthRange = defaultOfficePayoutPeriodRange(now);

  const revenuePromise = fetchAdminDashboardRevenueSummary(admin, now)
    .then((revenue) => {
      sections.businessHealth.revenueTodayZar = revenue.revenueTodayZar;
      sections.businessHealth.revenueMonthZar = revenue.revenueMonthZar;
    })
    .catch((error: unknown) => {
      sectionErrors.businessHealth =
        error instanceof Error ? error.message : "Failed to load dashboard revenue.";
    });

  const financePromise = loadFinancialDashboard(admin, monthRange.from, monthRange.to)
    .then((finance) => {
      sections.businessHealth.grossMarginCents = finance.profit.gross_margin_cents;
      sections.businessHealth.netOperatingPositionCents = finance.profit.net_profit_cents;
      sections.businessHealth.previousMonthComparisonPct = finance.summary_cards.revenue_growth_percent;
      sections.cashFlow.outstandingCustomerPaymentsCents =
        finance.executive_kpis.outstanding_customer_payments_cents;
      sections.cashFlow.cleanerLiabilitiesCents = finance.executive_kpis.pending_cleaner_payouts_cents;
      sections.summaries.financial = {
        customerRevenueCents: finance.profit.customer_revenue_cents,
        grossMarginCents: finance.profit.gross_margin_cents,
        netProfitCents: finance.profit.net_profit_cents,
        outstandingCustomerPaymentsCents: finance.executive_kpis.outstanding_customer_payments_cents,
      };
      // Incomplete team earnings are excluded from trusted profit; surface null profit if all margin is untrusted.
      if (
        finance.untrusted_incomplete_team.booking_count > 0 &&
        finance.profit.customer_revenue_cents === 0 &&
        finance.untrusted_incomplete_team.customer_revenue_cents > 0
      ) {
        sections.businessHealth.grossMarginCents = null;
        sections.businessHealth.netOperatingPositionCents = null;
        sections.summaries.financial.grossMarginCents = null;
        sections.summaries.financial.netProfitCents = null;
      }
    })
    .catch((error: unknown) => {
      sectionErrors.businessHealth =
        sectionErrors.businessHealth ??
        (error instanceof Error ? error.message : "Failed to load financial dashboard.");
      sectionErrors.cashFlow =
        error instanceof Error ? error.message : "Failed to load financial dashboard.";
      sectionErrors.summaries =
        error instanceof Error ? error.message : "Failed to load financial summary.";
    });

  const cashPromise = Promise.all([
    loadCashFlowDashboard(admin, monthRange.from, monthRange.to),
    sumApprovedExpensesInRange(admin, monthRange.from, monthRange.to),
  ])
    .then(([cash, approvedExpenses]) => {
      sections.cashFlow.cashReceivedMonthCents = cash.summary.money_received_cents;
      sections.cashFlow.approvedExpensesCents = approvedExpenses;
      sections.cashFlow.netCashPositionCents =
        cash.summary.cash_in_bank_cents + cash.summary.petty_cash_cents;
    })
    .catch((error: unknown) => {
      sectionErrors.cashFlow =
        sectionErrors.cashFlow ??
        (error instanceof Error ? error.message : "Failed to load cash flow.");
    });

  const payoutPromise = Promise.all([
    listMoneyActionProposals(admin, {
      status: "pending",
      limit: 100,
      offset: 0,
      viewerUserId,
    }),
    loadEligiblePayoutCents(admin),
  ])
    .then(([proposals, eligibleCents]) => {
      if (!proposals.ok) {
        sectionErrors.payoutApprovals = proposals.error;
        return;
      }
      const nowMs = now.getTime();
      let pendingAmount = 0;
      let overdue = 0;
      for (const item of proposals.items) {
        if (item.proposed_total_cents != null && Number.isFinite(item.proposed_total_cents)) {
          pendingAmount += item.proposed_total_cents;
        }
        if (item.expires_at && Date.parse(item.expires_at) < nowMs) overdue += 1;
      }
      sections.payoutApprovals.pendingApprovalAmountCents = pendingAmount;
      sections.payoutApprovals.pendingProposalCount = proposals.total;
      sections.payoutApprovals.overdueApprovalCount = overdue;
      sections.payoutApprovals.eligibleAmountCents = eligibleCents;
    })
    .catch((error: unknown) => {
      sectionErrors.payoutApprovals =
        error instanceof Error ? error.message : "Failed to load payout approvals.";
    });

  const securityPromise = loadSecurityCounts(admin)
    .then((security) => {
      sections.security.criticalAuditAlerts = security.criticalAuditAlerts;
      sections.security.recentPermissionChanges = security.recentPermissionChanges;
      // Explicitly unavailable — do not invent zeros.
      sections.security.failedLoginAlerts = null;
      sections.security.pendingAccessReviews = null;
    })
    .catch((error: unknown) => {
      sectionErrors.security = error instanceof Error ? error.message : "Failed to load security audit.";
      sections.security.failedLoginAlerts = null;
      sections.security.pendingAccessReviews = null;
    });

  const todayPromise = Promise.all([
    loadTodayBookings(admin, today),
    loadOfficePayoutPeriodReport(admin, today, today),
    loadOpsExceptionCount(admin),
  ])
    .then(([bookings, dayReport, exceptionCount]) => {
      const stats = computeOfficeTodayScheduleStats(bookings);
      const visitFinance = computeOfficeVisitDayFinance(bookings);
      sections.todaySnapshot.totalBookings = stats.total;
      sections.todaySnapshot.completed = stats.completed;
      sections.todaySnapshot.inProgress = stats.inProgress;
      sections.todaySnapshot.pendingOrUnallocated = stats.unassigned + stats.upcoming;
      sections.todaySnapshot.cancelled = stats.cancelled;
      sections.todaySnapshot.revenueZar = visitFinance.completedPaidValueZar;
      sections.todaySnapshot.cleanerEarningsCents = dayReport.totals.earned_cents;
      // Company share on completed visits; null when there are completed visits but no trusted company figure.
      if (stats.completed > 0 && dayReport.totals.visit_count === 0) {
        sections.todaySnapshot.estimatedGrossProfitCents = null;
      } else {
        sections.todaySnapshot.estimatedGrossProfitCents = dayReport.totals.company_earnings_cents;
      }
      sections.todaySnapshot.lateOrExceptionCount = exceptionCount;
      sections.businessHealth.completedBookingsToday = stats.completed;
    })
    .catch((error: unknown) => {
      sectionErrors.todaySnapshot =
        error instanceof Error ? error.message : "Failed to load today's snapshot.";
    });

  const summariesPromise = (async () => {
    const window = officeAnalyticsWindowFromParams(null, null, now);
    const sinceIso = officeAnalyticsFetchStartIso(window);
    const priorEndIso = priorCustomerQueryEndIso(window);

    const [bookingsRes, priorRes, cleanersRes, appsRes] = await Promise.all([
      admin
        .from("bookings")
        .select(ANALYTICS_BOOKING_SELECT)
        .or(`created_at.gte.${sinceIso},payment_completed_at.gte.${sinceIso}`)
        .order("created_at", { ascending: false })
        .limit(15000),
      admin
        .from("bookings")
        .select("customer_id, payment_status, payment_completed_at")
        .eq("payment_status", "success")
        .not("payment_completed_at", "is", null)
        .not("customer_id", "is", null)
        .lt("payment_completed_at", priorEndIso)
        .limit(20000),
      admin
        .from("cleaners")
        .select("id,is_active,is_available,status", { count: "exact" })
        .or("is_active.is.null,is_active.eq.true")
        .limit(5000),
      admin.from("cleaner_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    if (bookingsRes.error) throw new Error(bookingsRes.error.message);
    if (priorRes.error) throw new Error(priorRes.error.message);
    if (cleanersRes.error) throw new Error(cleanersRes.error.message);

    const analytics = computeOfficeAnalyticsSummary(
      (bookingsRes.data ?? []) as OfficeAnalyticsBookingRow[],
      extractPriorCustomerIds(priorRes.data ?? []),
      now,
      window,
    );

    sections.summaries.customers = {
      retentionPct: analytics.kpis.customerRetentionPct,
      totalBookingsWindow: analytics.kpis.totalBookings,
      avgBookingValueZar: analytics.kpis.avgBookingValueZar,
    };
    sections.summaries.bookingServices = analytics.servicePopularity.slice(0, 8).map((row) => ({
      label: row.name,
      count: row.count,
      revenueZar: null,
    }));

    const cleaners = cleanersRes.data ?? [];
    const availableToday = cleaners.filter((cleaner) => {
      const status = String(cleaner.status ?? "").trim().toLowerCase();
      return cleaner.is_available === true && status !== "offline" && status !== "paused" && status !== "suspended";
    }).length;

    sections.summaries.workforce = {
      activeCleaners: cleanersRes.count ?? cleaners.length,
      availableToday,
      pendingApplications: appsRes.error ? null : (appsRes.count ?? 0),
    };
  })().catch((error: unknown) => {
    sectionErrors.summaries =
      sectionErrors.summaries ??
      (error instanceof Error ? error.message : "Failed to load owner summaries.");
  });

  await Promise.all([
    revenuePromise,
    financePromise,
    cashPromise,
    payoutPromise,
    securityPromise,
    todayPromise,
    summariesPromise,
  ]);

  return {
    ok: true,
    generatedAt: now.toISOString(),
    sources: OWNER_COMMAND_CENTRE_SOURCES,
    ...sections,
    sectionErrors,
  };
}
