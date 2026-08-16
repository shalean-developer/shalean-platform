import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAdminDashboardRevenueSummary } from "@/lib/admin/dashboardRevenue";
import { computeOfficeVisitDayFinance } from "@/lib/admin/dashboardVisitDayFinance";
import { sumApprovedExpensesInRange } from "@/lib/admin/expenses/loadExpenses";
import { loadFinancialDashboard } from "@/lib/admin/expenses/loadFinancialDashboard";
import { computeOfficeAnalyticsSummary, extractPriorCustomerIds, officeAnalyticsFetchStartIso, officeAnalyticsWindowFromParams, priorCustomerQueryEndIso, type OfficeAnalyticsBookingRow } from "@/lib/admin/officeAnalytics";
import { computeOfficeTodayScheduleStats } from "@/lib/admin/officeTodayScheduleStats";
import { computeOpsSnapshotFromRows, OPS_SNAPSHOT_BOOKING_SELECT, type OpsSnapshotRow } from "@/lib/admin/opsSnapshot";
import { emptyOwnerCommandCentreSections, OWNER_COMMAND_CENTRE_SOURCES, type OwnerCommandCentrePayload } from "@/lib/admin/ownerCommandCentre";
import { loadOfficePayoutPeriodReport } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { listMoneyActionProposals } from "@/lib/payout/listMoneyActionProposals";

const ANALYTICS_BOOKING_SELECT = "id, created_at, updated_at, status, payment_status, payment_completed_at, total_paid_zar, amount_paid_cents, refunded_at, refund_status, billing_type, is_monthly_billing_booking, monthly_invoice_id, service, service_slug, customer_id, is_recurring_generated";
const SCHEDULE_BOOKING_SELECT = "id,date,time,status,cleaner_id,selected_cleaner_id,team_id,is_team_job,payment_status,payment_completed_at,payment_method,total_paid_zar,amount_paid_cents,total_price,refunded_at,refund_status,billing_type,is_monthly_billing_booking,monthly_invoice_id";
const PERMISSION_CHANGE_EVENT = /permission|role|assignment|grant|revoke/i;
const CRITICAL_AUDIT_EVENT = /critical|denied|forbidden|breach|security_alert/i;
const PRIOR_CUSTOMER_FALLBACK_LIMIT = 20_000;

function monthRangesMtd(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const currentFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const prev = new Date(Date.UTC(year!, month! - 2, 1));
  const py = prev.getUTCFullYear();
  const pm = prev.getUTCMonth() + 1;
  const prevLastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const comparableDay = Math.min(day!, prevLastDay);
  return {
    current: { from: currentFrom, to: today },
    previous: { from: `${py}-${String(pm).padStart(2, "0")}-01`, to: `${py}-${String(pm).padStart(2, "0")}-${String(comparableDay).padStart(2, "0")}` },
  };
}
function growthPercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}
function isMissingPriorCustomerRpcError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|function .*owner_prior_customer_ids.* does not exist/i.test(error.message ?? "");
}
async function loadPriorCustomerIds(admin: SupabaseClient, priorEndIso: string): Promise<Set<string>> {
  const rpcRes = await admin.rpc("owner_prior_customer_ids", { p_before: priorEndIso });
  if (!rpcRes.error) {
    return new Set((rpcRes.data ?? []).map((row: { customer_id?: string | null }) => row.customer_id).filter((id): id is string => Boolean(id)));
  }

  // Additive migration rollout safety only. Operational failures must not trigger the old 20k-row read.
  if (!isMissingPriorCustomerRpcError(rpcRes.error)) throw new Error(rpcRes.error.message);

  const fallback = await admin
    .from("bookings")
    .select("customer_id, payment_status, payment_completed_at")
    .eq("payment_status", "success")
    .not("payment_completed_at", "is", null)
    .not("customer_id", "is", null)
    .lt("payment_completed_at", priorEndIso)
    .limit(PRIOR_CUSTOMER_FALLBACK_LIMIT);
  if (fallback.error) throw new Error(fallback.error.message);
  return extractPriorCustomerIds(fallback.data ?? []);
}
async function loadEligiblePayoutCents(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.from("bookings").select("cleaner_id, payout_owner_cleaner_id, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents").eq("payout_status", "eligible");
  if (error) throw new Error(error.message);
  let total = 0;
  for (const row of data ?? []) total += resolveCleanerEarningsCents({ cleaner_earnings_total_cents: row.cleaner_earnings_total_cents, payout_frozen_cents: row.payout_frozen_cents, display_earnings_cents: row.display_earnings_cents }) ?? 0;
  return total;
}
async function loadSecurityCounts(admin: SupabaseClient) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await admin.from("admin_audit_events").select("event_type").gte("created_at", since).limit(2000);
  if (error) throw new Error(error.message);
  let criticalAuditAlerts = 0, recentPermissionChanges = 0;
  for (const row of data ?? []) { const t = String(row.event_type ?? ""); if (CRITICAL_AUDIT_EVENT.test(t)) criticalAuditAlerts++; if (PERMISSION_CHANGE_EVENT.test(t)) recentPermissionChanges++; }
  return { criticalAuditAlerts, recentPermissionChanges };
}
async function loadTodayBookings(admin: SupabaseClient, today: string) { const { data, error } = await admin.from("bookings").select(SCHEDULE_BOOKING_SELECT).eq("date", today).order("time", { ascending: true }).limit(5000); if (error) throw new Error(error.message); return data ?? []; }
async function loadOpsExceptionCount(admin: SupabaseClient) { const { data, error } = await admin.from("bookings").select(OPS_SNAPSHOT_BOOKING_SELECT).not("status", "in", "(completed,cancelled,failed,payment_expired)").order("created_at", { ascending: true }).limit(5000); if (error) throw new Error(error.message); const s = computeOpsSnapshotFromRows((data ?? []) as OpsSnapshotRow[]); return s.slaBreaches + s.unassignedPastDue; }

export async function loadOwnerCommandCentre(admin: SupabaseClient, viewerUserId: string, now = new Date()): Promise<OwnerCommandCentrePayload> {
  const sections = emptyOwnerCommandCentreSections(); const sectionErrors: OwnerCommandCentrePayload["sectionErrors"] = {}; const today = todayYmdJohannesburg(now); const mtd = monthRangesMtd(today);
  const revenuePromise = fetchAdminDashboardRevenueSummary(admin, now).then(r => { sections.businessHealth.revenueTodayZar=r.revenueTodayZar; sections.businessHealth.revenueMonthZar=r.revenueMonthZar; }).catch((e:unknown)=>{sectionErrors.businessHealth=e instanceof Error?e.message:"Failed to load dashboard revenue.";});
  const financePromise = Promise.all([loadFinancialDashboard(admin,mtd.current.from,mtd.current.to), loadFinancialDashboard(admin,mtd.previous.from,mtd.previous.to)]).then(([finance,prev])=>{
    sections.businessHealth.grossMarginCents=finance.profit.gross_margin_cents; sections.businessHealth.netOperatingPositionCents=finance.profit.net_profit_cents; sections.businessHealth.previousMonthComparisonPct=growthPercent(finance.profit.customer_revenue_cents,prev.profit.customer_revenue_cents);
    sections.cashFlow.outstandingCustomerPaymentsCents=finance.executive_kpis.outstanding_customer_payments_cents; sections.cashFlow.cleanerLiabilitiesCents=finance.executive_kpis.pending_cleaner_payouts_cents;
    sections.cashFlow.netCashPositionCents=finance.executive_kpis.cash_in_bank_cents+finance.executive_kpis.petty_cash_balance_cents;
    sections.summaries.financial={customerRevenueCents:finance.profit.customer_revenue_cents,grossMarginCents:finance.profit.gross_margin_cents,netProfitCents:finance.profit.net_profit_cents,outstandingCustomerPaymentsCents:finance.executive_kpis.outstanding_customer_payments_cents};
    if(finance.untrusted_incomplete_team.booking_count>0&&finance.profit.customer_revenue_cents===0&&finance.untrusted_incomplete_team.customer_revenue_cents>0){sections.businessHealth.grossMarginCents=null;sections.businessHealth.netOperatingPositionCents=null;sections.summaries.financial.grossMarginCents=null;sections.summaries.financial.netProfitCents=null;}
  }).catch((e:unknown)=>{const msg=e instanceof Error?e.message:"Failed to load financial dashboard.";sectionErrors.businessHealth=sectionErrors.businessHealth??msg;sectionErrors.cashFlow=msg;sectionErrors.summaries=msg;});
  const expensesPromise=sumApprovedExpensesInRange(admin,mtd.current.from,mtd.current.to).then(v=>{sections.cashFlow.approvedExpensesCents=v;}).catch((e:unknown)=>{sectionErrors.cashFlow=sectionErrors.cashFlow??(e instanceof Error?e.message:"Failed to load approved expenses.");});
  const payoutPromise=Promise.all([listMoneyActionProposals(admin,{status:"pending",limit:100,offset:0,viewerUserId}),loadEligiblePayoutCents(admin)]).then(([p,eligible])=>{if(!p.ok){sectionErrors.payoutApprovals=p.error;return;}let amount=0,overdue=0;const nowMs=now.getTime();for(const i of p.items){if(i.proposed_total_cents!=null&&Number.isFinite(i.proposed_total_cents))amount+=i.proposed_total_cents;if(i.expires_at&&Date.parse(i.expires_at)<nowMs)overdue++;}sections.payoutApprovals.pendingApprovalAmountCents=amount;sections.payoutApprovals.pendingProposalCount=p.total;sections.payoutApprovals.overdueApprovalCount=overdue;sections.payoutApprovals.eligibleAmountCents=eligible;}).catch((e:unknown)=>{sectionErrors.payoutApprovals=e instanceof Error?e.message:"Failed to load payout approvals.";});
  const securityPromise=loadSecurityCounts(admin).then(s=>{sections.security.criticalAuditAlerts=s.criticalAuditAlerts;sections.security.recentPermissionChanges=s.recentPermissionChanges;sections.security.failedLoginAlerts=null;sections.security.pendingAccessReviews=null;}).catch((e:unknown)=>{sectionErrors.security=e instanceof Error?e.message:"Failed to load security audit.";});
  const todayPromise=Promise.all([loadTodayBookings(admin,today),loadOfficePayoutPeriodReport(admin,today,today),loadOpsExceptionCount(admin)]).then(([bookings,dayReport,exceptions])=>{const stats=computeOfficeTodayScheduleStats(bookings);const vf=computeOfficeVisitDayFinance(bookings);sections.todaySnapshot.totalBookings=stats.total;sections.todaySnapshot.completed=stats.completed;sections.todaySnapshot.inProgress=stats.inProgress;sections.todaySnapshot.pendingOrUnallocated=stats.unassigned+stats.upcoming;sections.todaySnapshot.cancelled=stats.cancelled;sections.todaySnapshot.revenueZar=vf.completedPaidValueZar;sections.todaySnapshot.cleanerEarningsCents=dayReport.totals.earned_cents;sections.todaySnapshot.estimatedGrossProfitCents=stats.completed>0&&dayReport.totals.visit_count===0?null:dayReport.totals.company_earnings_cents;sections.todaySnapshot.lateOrExceptionCount=exceptions;sections.businessHealth.completedBookingsToday=stats.completed;}).catch((e:unknown)=>{sectionErrors.todaySnapshot=e instanceof Error?e.message:"Failed to load today's snapshot.";});
  const summariesPromise=(async()=>{
    const window=officeAnalyticsWindowFromParams(null,null,now);
    const sinceIso=officeAnalyticsFetchStartIso(window);
    const priorEndIso=priorCustomerQueryEndIso(window);
    const [b,priorCustomerIds,c,a]=await Promise.all([
      admin.from("bookings").select(ANALYTICS_BOOKING_SELECT).or(`created_at.gte.${sinceIso},payment_completed_at.gte.${sinceIso}`).order("created_at",{ascending:false}).limit(15000),
      loadPriorCustomerIds(admin, priorEndIso),
      admin.from("cleaners").select("id,is_active,is_available,status",{count:"exact"}).or("is_active.is.null,is_active.eq.true").limit(5000),
      admin.from("cleaner_applications").select("id",{count:"exact",head:true}).eq("status","pending")
    ]);
    if(b.error)throw new Error(b.error.message);
    if(c.error)throw new Error(c.error.message);
    const an=computeOfficeAnalyticsSummary((b.data??[]) as OfficeAnalyticsBookingRow[],priorCustomerIds,now,window);
    sections.summaries.customers={retentionPct:an.kpis.customerRetentionPct,totalBookingsWindow:an.kpis.totalBookings,avgBookingValueZar:an.kpis.avgBookingValueZar};
    sections.summaries.bookingServices=an.servicePopularity.slice(0,8).map(r=>({label:r.name,count:r.count,revenueZar:null}));
    const cleaners=c.data??[];
    sections.summaries.workforce={activeCleaners:c.count??cleaners.length,availableToday:cleaners.filter(x=>x.is_available===true&&!['offline','paused','suspended'].includes(String(x.status??'').trim().toLowerCase())).length,pendingApplications:a.error?null:(a.count??0)};
  })().catch((e:unknown)=>{sectionErrors.summaries=sectionErrors.summaries??(e instanceof Error?e.message:"Failed to load owner summaries.");});
  await Promise.all([revenuePromise,financePromise,expensesPromise,payoutPromise,securityPromise,todayPromise,summariesPromise]); return {ok:true,generatedAt:now.toISOString(),sources:OWNER_COMMAND_CENTRE_SOURCES,...sections,sectionErrors};
}
