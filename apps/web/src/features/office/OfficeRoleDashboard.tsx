"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  hasAnyOfficePermission,
  inferOfficeRole,
  policyForOfficePath,
  type OfficeRoleKey,
} from "@/lib/admin/officeExperience";
import {
  canAccessOwnerCommandCentre,
  formatOwnerCount,
  formatOwnerPct,
  formatOwnerZar,
  formatOwnerZarFromCents,
  ownerQuickActionsForPermissions,
  type OwnerCommandCentrePayload,
} from "@/lib/admin/ownerCommandCentre";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

export type OfficeRoleAssignment = {
  assignmentId: string;
  roleId: string;
  code: string;
  name: string;
  branchId: string | null;
  teamId: string | null;
  startsAt: string;
  expiresAt: string | null;
};

export type OfficeAccessProfile = {
  roles: OfficeRoleAssignment[];
  branchIds: string[];
  teamIds: string[];
};

export type OfficeRoleDashboardProps = {
  permissions: ReadonlySet<string>;
  profile: OfficeAccessProfile;
};

type Workspace = { label: string; description: string; href: string; metric: string };
type Experience = { title: string; subtitle: string; workspaces: Workspace[]; reports: Workspace[] };

const EXPERIENCES: Record<OfficeRoleKey, Experience> = {
  owner: {
    title: "Owner command centre",
    subtitle: "Company-wide control, financial visibility, risk oversight and administration.",
    workspaces: [
      { label: "Business health", description: "Revenue, margin and operating position.", href: "/office/business-health", metric: "Executive KPI" },
      { label: "Cash flow", description: "Cash movement and liquidity view.", href: "/office/cash-flow", metric: "Finance KPI" },
      { label: "Payout approvals", description: "Maker-checker approval queue.", href: "/office/payouts/approvals", metric: "Control queue" },
      { label: "Security", description: "Roles, permissions and audit controls.", href: "/office/security", metric: "Risk control" },
    ],
    reports: [
      { label: "Booking profitability", description: "Revenue and cost by booking.", href: "/office/booking-profitability", metric: "Profit report" },
      { label: "Operations health", description: "Service reliability and operational exceptions.", href: "/office/ops-health", metric: "Operations report" },
    ],
  },
  manager: {
    title: "General Manager workspace",
    subtitle: "Cross-functional performance, exceptions, approvals and service delivery.",
    workspaces: [
      { label: "Operations", description: "Daily service delivery and exception management.", href: "/office/operations", metric: "Daily KPI" },
      { label: "Schedule", description: "Bookings, allocation and team coverage.", href: "/office/schedule", metric: "Coverage KPI" },
      { label: "Business health", description: "Management-level financial summary.", href: "/office/business-health", metric: "Management KPI" },
      { label: "Customers", description: "Customer issues, retention and service recovery.", href: "/office/customers", metric: "Customer KPI" },
    ],
    reports: [
      { label: "Cleaner performance", description: "Workforce quality and reliability.", href: "/office/cleaner-performance", metric: "Workforce report" },
      { label: "Analytics", description: "Growth and conversion performance.", href: "/office/analytics", metric: "Growth report" },
    ],
  },
  operations: {
    title: "Operations workspace",
    subtitle: "Today's bookings, allocation, incidents and service-delivery health.",
    workspaces: [
      { label: "Schedule", description: "Monitor today's work and team coverage.", href: "/office/schedule", metric: "Today's coverage" },
      { label: "Bookings", description: "Manage booking progress and assignments.", href: "/office/bookings", metric: "Booking queue" },
      { label: "Ops queue", description: "Resolve operational exceptions.", href: "/office/ops-queue", metric: "Exception queue" },
      { label: "SLA breaches", description: "Prioritise overdue service actions.", href: "/office/sla-breaches", metric: "SLA KPI" },
    ],
    reports: [
      { label: "Cleaner performance", description: "Quality and reliability trends.", href: "/office/cleaner-performance", metric: "Quality report" },
      { label: "Dispatch metrics", description: "Allocation and response performance.", href: "/office/metrics", metric: "Dispatch report" },
    ],
  },
  finance: {
    title: "Finance workspace",
    subtitle: "Cash, expenses, reconciliation, profitability and payout preparation.",
    workspaces: [
      { label: "Financial dashboard", description: "Current financial performance summary.", href: "/office/financial-dashboard", metric: "Finance KPI" },
      { label: "Cash flow", description: "Monitor inflows, outflows and liquidity.", href: "/office/cash-flow", metric: "Cash KPI" },
      { label: "Expenses", description: "Review and manage business expenditure.", href: "/office/expenses", metric: "Expense queue" },
      { label: "Payouts", description: "Prepare and review cleaner payout records.", href: "/office/payouts", metric: "Payout queue" },
    ],
    reports: [
      { label: "Booking profitability", description: "Margin by booking and service.", href: "/office/booking-profitability", metric: "Profit report" },
      { label: "Payment reconciliation", description: "Match payments, invoices and records.", href: "/office/payment-reconciliation", metric: "Reconciliation report" },
    ],
  },
  "customer-care": {
    title: "Customer Care workspace",
    subtitle: "Customer records, booking support, reviews and service recovery.",
    workspaces: [
      { label: "Customers", description: "Find and support customer accounts.", href: "/office/customers", metric: "Customer queue" },
      { label: "Bookings", description: "Review booking details and customer requests.", href: "/office/bookings", metric: "Support queue" },
      { label: "Reviews", description: "Monitor feedback and follow-up needs.", href: "/office/reviews", metric: "Review KPI" },
      { label: "Notifications", description: "Send approved customer communications.", href: "/office/notifications", metric: "Communication tool" },
    ],
    reports: [
      { label: "Review funnel", description: "Track review requests and outcomes.", href: "/office/review-funnel", metric: "Customer report" },
      { label: "Notification logs", description: "Confirm delivery and communication history.", href: "/office/notification-logs", metric: "Delivery report" },
    ],
  },
  workforce: {
    title: "Workforce workspace",
    subtitle: "Cleaner records, applications, teams, availability and performance.",
    workspaces: [
      { label: "Cleaners", description: "Manage cleaner profiles and availability.", href: "/office/cleaners", metric: "Workforce KPI" },
      { label: "Teams", description: "Build and maintain operating teams.", href: "/office/teams", metric: "Team coverage" },
      { label: "Applications", description: "Review cleaner applications.", href: "/office/cleaner-applications", metric: "Application queue" },
      { label: "Schedule", description: "Review workforce demand and coverage.", href: "/office/schedule", metric: "Capacity KPI" },
    ],
    reports: [
      { label: "Cleaner performance", description: "Reliability, quality and booking activity.", href: "/office/cleaner-performance", metric: "Performance report" },
      { label: "Cleaner feedback", description: "Reports, feedback and follow-up actions.", href: "/office/cleaner-report-feedback", metric: "Feedback report" },
    ],
  },
  marketing: {
    title: "Marketing workspace",
    subtitle: "Campaigns, content, conversion, SEO and channel performance.",
    workspaces: [
      { label: "Marketing", description: "Campaign performance and growth overview.", href: "/office/marketing", metric: "Marketing KPI" },
      { label: "Campaigns", description: "Plan and manage active campaigns.", href: "/office/marketing/campaigns", metric: "Campaign queue" },
      { label: "Blog", description: "Draft and publish governed content.", href: "/office/blog", metric: "Content queue" },
      { label: "SEO insights", description: "Search visibility and content opportunities.", href: "/office/seo-insights", metric: "SEO KPI" },
    ],
    reports: [
      { label: "Campaign analytics", description: "Channel and campaign results.", href: "/office/marketing/analytics", metric: "Campaign report" },
      { label: "Conversion", description: "Booking conversion and funnel performance.", href: "/office/conversion", metric: "Conversion report" },
    ],
  },
  supervisor: {
    title: "Supervisor workspace",
    subtitle: "Assigned teams, daily schedule, attendance and service quality.",
    workspaces: [
      { label: "Schedule", description: "See assigned bookings and team coverage.", href: "/office/schedule", metric: "Daily schedule" },
      { label: "Bookings", description: "Review bookings within your permitted scope.", href: "/office/bookings", metric: "Booking queue" },
      { label: "Teams", description: "View and coordinate assigned teams.", href: "/office/teams", metric: "Team view" },
    ],
    reports: [],
  },
  restricted: { title: "Office workspace", subtitle: "Your account has limited Office access.", workspaces: [], reports: [] },
};

function allowed(items: Workspace[], permissions: ReadonlySet<string>): Workspace[] {
  return items.filter((item) => {
    const policy = policyForOfficePath(item.href);
    return Boolean(policy && hasAnyOfficePermission(permissions, policy.anyOf));
  });
}

function KpiValue({ value }: { value: string }) {
  const unavailable = value === "Not available";
  return (
    <p className={`mt-1 text-xl font-bold tabular-nums tracking-tight ${unavailable ? "text-slate-400" : "text-slate-950"}`}>
      {value}
    </p>
  );
}

function LiveMetricCard({
  href,
  title,
  primary,
  rows,
  error,
  loading,
}: {
  href: string;
  title: string;
  primary: { label: string; value: string };
  rows: Array<{ label: string; value: string }>;
  error?: string;
  loading?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.035)] transition hover:border-blue-200 hover:shadow-[0_8px_20px_rgba(15,23,42,0.07)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {loading ? <span className="text-[10px] font-semibold uppercase text-slate-400">Loading</span> : null}
        {error ? <span className="text-[10px] font-semibold uppercase text-amber-600">Partial</span> : null}
      </div>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">{primary.label}</p>
      <KpiValue value={loading ? "…" : primary.value} />
      <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className={`tabular-nums font-semibold ${row.value === "Not available" ? "text-slate-400" : "text-slate-800"}`}>
              {loading ? "…" : row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[88px]">
      <p className={`text-lg font-bold tabular-nums ${value === "Not available" ? "text-slate-400" : "text-slate-950"}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function SummaryPanel({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.035)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {href ? (
          <Link href={href} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
            Open →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function OwnerLiveCommandCentre({ permissions }: { permissions: ReadonlySet<string> }) {
  const [data, setData] = useState<OwnerCommandCentrePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canAccessOwnerCommandCentre(permissions)) {
        if (!cancelled) {
          setRestricted(true);
          setLoading(false);
        }
        return;
      }
      const token = await getSupabaseAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Office session unavailable.");
          setLoading(false);
        }
        return;
      }
      try {
        const response = await fetch("/api/admin/owner-command-centre", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as OwnerCommandCentrePayload & {
          error?: string;
          code?: string;
        };
        if (cancelled) return;
        if (response.status === 403) {
          setRestricted(true);
          setError(null);
        } else if (!response.ok) {
          setError(payload.error || "Could not load owner KPIs.");
        } else {
          setData(payload);
        }
      } catch {
        if (!cancelled) setError("Could not load owner KPIs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permissions]);

  const quickActions = ownerQuickActionsForPermissions(permissions);
  const zar = formatOwnerZar;
  const zarCents = formatOwnerZarFromCents;
  const count = formatOwnerCount;
  const pct = formatOwnerPct;

  if (restricted) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Owner Command Centre KPIs are restricted to Owner accounts. Navigation below remains permission-scoped.
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {error}
      </section>
    );
  }

  const bh = data?.businessHealth;
  const cf = data?.cashFlow;
  const pa = data?.payoutApprovals;
  const sec = data?.security;
  const snap = data?.todaySnapshot;
  const summaries = data?.summaries;

  return (
    <div className="space-y-6" data-testid="owner-command-centre-live">
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Priority workspace</h2>
            <p className="text-sm text-slate-500">Live company KPIs from existing reporting APIs.</p>
          </div>
          {error ? <p className="text-xs text-amber-700">{error}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <LiveMetricCard
            href="/office/business-health"
            title="Business health"
            loading={loading}
            error={data?.sectionErrors.businessHealth}
            primary={{ label: "Revenue today (payment date)", value: zar(bh?.revenueTodayZar ?? null) }}
            rows={[
              { label: "Revenue this month", value: zar(bh?.revenueMonthZar ?? null) },
              { label: "Completed bookings today", value: count(bh?.completedBookingsToday ?? null) },
              { label: "Gross margin", value: zarCents(bh?.grossMarginCents ?? null) },
              { label: "Net operating position", value: zarCents(bh?.netOperatingPositionCents ?? null) },
              { label: "Vs previous period", value: pct(bh?.previousMonthComparisonPct ?? null) },
            ]}
          />
          <LiveMetricCard
            href="/office/cash-flow"
            title="Cash flow"
            loading={loading}
            error={data?.sectionErrors.cashFlow}
            primary={{ label: "Cash received this month", value: zarCents(cf?.cashReceivedMonthCents ?? null) }}
            rows={[
              { label: "Outstanding customer payments", value: zarCents(cf?.outstandingCustomerPaymentsCents ?? null) },
              { label: "Approved expenses", value: zarCents(cf?.approvedExpensesCents ?? null) },
              { label: "Cleaner liabilities waiting", value: zarCents(cf?.cleanerLiabilitiesCents ?? null) },
              { label: "Net cash position", value: zarCents(cf?.netCashPositionCents ?? null) },
            ]}
          />
          <LiveMetricCard
            href="/office/payouts/approvals"
            title="Payout approvals"
            loading={loading}
            error={data?.sectionErrors.payoutApprovals}
            primary={{ label: "Pending approval amount", value: zarCents(pa?.pendingApprovalAmountCents ?? null) }}
            rows={[
              { label: "Eligible amount", value: zarCents(pa?.eligibleAmountCents ?? null) },
              { label: "Pending proposals", value: count(pa?.pendingProposalCount ?? null) },
              { label: "Overdue approvals", value: count(pa?.overdueApprovalCount ?? null) },
            ]}
          />
          <LiveMetricCard
            href="/office/security"
            title="Security"
            loading={loading}
            error={data?.sectionErrors.security}
            primary={{ label: "Critical audit alerts (7d)", value: count(sec?.criticalAuditAlerts ?? null) }}
            rows={[
              { label: "Recent permission changes", value: count(sec?.recentPermissionChanges ?? null) },
              { label: "Failed login alerts", value: count(sec?.failedLoginAlerts ?? null) },
              { label: "Pending access reviews", value: count(sec?.pendingAccessReviews ?? null) },
            ]}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.035)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Today&apos;s business snapshot</h2>
            <p className="text-sm text-slate-500">Visit-date operations for today (Johannesburg). Revenue is completed paid visit value — not payment-date cash-in.</p>
          </div>
          <Link href="/office/schedule" className="text-xs font-semibold text-blue-700 hover:text-blue-900">
            Open schedule →
          </Link>
        </div>
        {data?.sectionErrors.todaySnapshot ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{data.sectionErrors.todaySnapshot}</p>
        ) : null}
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <SnapshotStat label="Total bookings" value={loading ? "…" : count(snap?.totalBookings ?? null)} />
          <SnapshotStat label="Completed" value={loading ? "…" : count(snap?.completed ?? null)} />
          <SnapshotStat label="In progress" value={loading ? "…" : count(snap?.inProgress ?? null)} />
          <SnapshotStat label="Pending / unallocated" value={loading ? "…" : count(snap?.pendingOrUnallocated ?? null)} />
          <SnapshotStat label="Cancelled" value={loading ? "…" : count(snap?.cancelled ?? null)} />
          <SnapshotStat label="Revenue (visit paid)" value={loading ? "…" : zar(snap?.revenueZar ?? null)} />
          <SnapshotStat label="Cleaner earnings" value={loading ? "…" : zarCents(snap?.cleanerEarningsCents ?? null)} />
          <SnapshotStat label="Est. gross profit" value={loading ? "…" : zarCents(snap?.estimatedGrossProfitCents ?? null)} />
          <SnapshotStat label="Late / exceptions" value={loading ? "…" : count(snap?.lateOrExceptionCount ?? null)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-950">Owner summaries</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryPanel title="Customers · Current window" href="/office/customers">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Retention</dt><dd className="font-semibold tabular-nums">{loading ? "…" : pct(summaries?.customers.retentionPct ?? null)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Bookings (window)</dt><dd className="font-semibold tabular-nums">{loading ? "…" : count(summaries?.customers.totalBookingsWindow ?? null)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Avg booking value</dt><dd className="font-semibold tabular-nums">{loading ? "…" : zar(summaries?.customers.avgBookingValueZar ?? null)}</dd></div>
            </dl>
          </SummaryPanel>
          <SummaryPanel title="Workforce · Today" href="/office/cleaners">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Active cleaners</dt><dd className="font-semibold tabular-nums">{loading ? "…" : count(summaries?.workforce.activeCleaners ?? null)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Available today</dt><dd className="font-semibold tabular-nums">{loading ? "…" : count(summaries?.workforce.availableToday ?? null)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Pending applications</dt><dd className="font-semibold tabular-nums">{loading ? "…" : count(summaries?.workforce.pendingApplications ?? null)}</dd></div>
            </dl>
          </SummaryPanel>
          <SummaryPanel title="Booking services · Current window" href="/office/analytics">
            {loading ? <p className="text-xs text-slate-400">Loading…</p> : null}
            {!loading && (summaries?.bookingServices.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-500">No service breakdown available.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {(summaries?.bookingServices ?? []).slice(0, 5).map((row) => (
                  <li key={row.label} className="flex justify-between gap-2">
                    <span className="truncate text-slate-500">{row.label}</span>
                    <span className="font-semibold tabular-nums text-slate-800">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </SummaryPanel>
          <SummaryPanel title="Financial · This month" href="/office/financial-dashboard">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Customer revenue</dt><dd className="font-semibold tabular-nums">{loading ? "…" : zarCents(summaries?.financial.customerRevenueCents ?? null)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Gross margin</dt><dd className="font-semibold tabular-nums">{loading ? "…" : zarCents(summaries?.financial.grossMarginCents ?? null)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Net profit</dt><dd className="font-semibold tabular-nums">{loading ? "…" : zarCents(summaries?.financial.netProfitCents ?? null)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Outstanding</dt><dd className="font-semibold tabular-nums">{loading ? "…" : zarCents(summaries?.financial.outstandingCustomerPaymentsCents ?? null)}</dd></div>
            </dl>
          </SummaryPanel>
        </div>
      </section>

      {quickActions.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-950">Quick actions</h2>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-800"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function NavGrid({ items, reports = false }: { items: Workspace[]; reports?: boolean }) {
  return (
    <div className={`grid gap-3 ${reports ? "md:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group flex min-h-[108px] items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
        >
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              {item.metric}
            </span>
            <h3 className="mt-2.5 text-sm font-semibold text-slate-950">{item.label}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function OfficeRoleDashboard({ permissions, profile }: OfficeRoleDashboardProps) {
  const role = inferOfficeRole(permissions);
  const experience = EXPERIENCES[role];
  const workspaces = allowed(experience.workspaces, permissions);
  const reports = allowed(experience.reports, permissions);
  const roleNames = profile.roles.map((assignment) => assignment.name).join(", ") || role;
  const isOwner = role === "owner";

  return (
    <main className="space-y-6" data-office-role={role}>
      <header className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-[0_4px_22px_rgba(15,23,42,0.045)] sm:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">Role-based Office experience</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{experience.title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{experience.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">Role: {roleNames}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">Permissions: {permissions.size}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">Branches: {profile.branchIds.length || "Global"}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">Teams: {profile.teamIds.length || "None"}</span>
        </div>
        {role === "supervisor" && profile.teamIds.length === 0 ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Supervisor access has no assigned team scope. Team data must remain unavailable until the Owner assigns a team.
          </p>
        ) : null}
      </header>

      {isOwner ? <OwnerLiveCommandCentre permissions={permissions} /> : null}

      {!isOwner ? (
        workspaces.length ? (
          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-950">Your priority workspace</h2>
            <NavGrid items={workspaces} />
          </section>
        ) : (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            No Office modules are assigned to this account.
          </section>
        )
      ) : null}

      {!isOwner && reports.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-950">Role reports and KPIs</h2>
          <NavGrid items={reports} reports />
        </section>
      ) : null}

      {isOwner && reports.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-950">Role reports</h2>
          <NavGrid items={reports} reports />
        </section>
      ) : null}
    </main>
  );
}
