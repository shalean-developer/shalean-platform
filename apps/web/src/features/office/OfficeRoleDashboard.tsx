"use client";

import Link from "next/link";
import { inferOfficeRole, policyForOfficePath, hasAnyOfficePermission, type OfficeRoleKey } from "@/lib/admin/officeExperience";

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
  owner: { title: "Owner command centre", subtitle: "Company-wide control, financial visibility, risk oversight and administration.", workspaces: [
    { label: "Business health", description: "Revenue, margin and operating position.", href: "/office/business-health", metric: "Executive KPI" },
    { label: "Cash flow", description: "Cash movement and liquidity view.", href: "/office/cash-flow", metric: "Finance KPI" },
    { label: "Payout approvals", description: "Maker-checker approval queue.", href: "/office/payouts/approvals", metric: "Control queue" },
    { label: "Security", description: "Roles, permissions and audit controls.", href: "/office/security", metric: "Risk control" },
  ], reports: [
    { label: "Booking profitability", description: "Revenue and cost by booking.", href: "/office/booking-profitability", metric: "Profit report" },
    { label: "Operations health", description: "Service reliability and operational exceptions.", href: "/office/ops-health", metric: "Operations report" },
  ] },
  manager: { title: "General Manager workspace", subtitle: "Cross-functional performance, exceptions, approvals and service delivery.", workspaces: [
    { label: "Operations", description: "Daily service delivery and exception management.", href: "/office/operations", metric: "Daily KPI" },
    { label: "Schedule", description: "Bookings, allocation and team coverage.", href: "/office/schedule", metric: "Coverage KPI" },
    { label: "Business health", description: "Management-level financial summary.", href: "/office/business-health", metric: "Management KPI" },
    { label: "Customers", description: "Customer issues, retention and service recovery.", href: "/office/customers", metric: "Customer KPI" },
  ], reports: [
    { label: "Cleaner performance", description: "Workforce quality and reliability.", href: "/office/cleaner-performance", metric: "Workforce report" },
    { label: "Analytics", description: "Growth and conversion performance.", href: "/office/analytics", metric: "Growth report" },
  ] },
  operations: { title: "Operations workspace", subtitle: "Today's bookings, allocation, incidents and service-delivery health.", workspaces: [
    { label: "Schedule", description: "Monitor today's work and team coverage.", href: "/office/schedule", metric: "Today's coverage" },
    { label: "Bookings", description: "Manage booking progress and assignments.", href: "/office/bookings", metric: "Booking queue" },
    { label: "Ops queue", description: "Resolve operational exceptions.", href: "/office/ops-queue", metric: "Exception queue" },
    { label: "SLA breaches", description: "Prioritise overdue service actions.", href: "/office/sla-breaches", metric: "SLA KPI" },
  ], reports: [
    { label: "Cleaner performance", description: "Quality and reliability trends.", href: "/office/cleaner-performance", metric: "Quality report" },
    { label: "Dispatch metrics", description: "Allocation and response performance.", href: "/office/metrics", metric: "Dispatch report" },
  ] },
  finance: { title: "Finance workspace", subtitle: "Cash, expenses, reconciliation, profitability and payout preparation.", workspaces: [
    { label: "Financial dashboard", description: "Current financial performance summary.", href: "/office/financial-dashboard", metric: "Finance KPI" },
    { label: "Cash flow", description: "Monitor inflows, outflows and liquidity.", href: "/office/cash-flow", metric: "Cash KPI" },
    { label: "Expenses", description: "Review and manage business expenditure.", href: "/office/expenses", metric: "Expense queue" },
    { label: "Payouts", description: "Prepare and review cleaner payout records.", href: "/office/payouts", metric: "Payout queue" },
  ], reports: [
    { label: "Booking profitability", description: "Margin by booking and service.", href: "/office/booking-profitability", metric: "Profit report" },
    { label: "Payment reconciliation", description: "Match payments, invoices and records.", href: "/office/payment-reconciliation", metric: "Reconciliation report" },
  ] },
  "customer-care": { title: "Customer Care workspace", subtitle: "Customer records, booking support, reviews and service recovery.", workspaces: [
    { label: "Customers", description: "Find and support customer accounts.", href: "/office/customers", metric: "Customer queue" },
    { label: "Bookings", description: "Review booking details and customer requests.", href: "/office/bookings", metric: "Support queue" },
    { label: "Reviews", description: "Monitor feedback and follow-up needs.", href: "/office/reviews", metric: "Review KPI" },
    { label: "Notifications", description: "Send approved customer communications.", href: "/office/notifications", metric: "Communication tool" },
  ], reports: [
    { label: "Review funnel", description: "Track review requests and outcomes.", href: "/office/review-funnel", metric: "Customer report" },
    { label: "Notification logs", description: "Confirm delivery and communication history.", href: "/office/notification-logs", metric: "Delivery report" },
  ] },
  workforce: { title: "Workforce workspace", subtitle: "Cleaner records, applications, teams, availability and performance.", workspaces: [
    { label: "Cleaners", description: "Manage cleaner profiles and availability.", href: "/office/cleaners", metric: "Workforce KPI" },
    { label: "Teams", description: "Build and maintain operating teams.", href: "/office/teams", metric: "Team coverage" },
    { label: "Applications", description: "Review cleaner applications.", href: "/office/cleaner-applications", metric: "Application queue" },
    { label: "Schedule", description: "Review workforce demand and coverage.", href: "/office/schedule", metric: "Capacity KPI" },
  ], reports: [
    { label: "Cleaner performance", description: "Reliability, quality and booking activity.", href: "/office/cleaner-performance", metric: "Performance report" },
    { label: "Cleaner feedback", description: "Reports, feedback and follow-up actions.", href: "/office/cleaner-report-feedback", metric: "Feedback report" },
  ] },
  marketing: { title: "Marketing workspace", subtitle: "Campaigns, content, conversion, SEO and channel performance.", workspaces: [
    { label: "Marketing", description: "Campaign performance and growth overview.", href: "/office/marketing", metric: "Marketing KPI" },
    { label: "Campaigns", description: "Plan and manage active campaigns.", href: "/office/marketing/campaigns", metric: "Campaign queue" },
    { label: "Blog", description: "Draft and publish governed content.", href: "/office/blog", metric: "Content queue" },
    { label: "SEO insights", description: "Search visibility and content opportunities.", href: "/office/seo-insights", metric: "SEO KPI" },
  ], reports: [
    { label: "Campaign analytics", description: "Channel and campaign results.", href: "/office/marketing/analytics", metric: "Campaign report" },
    { label: "Conversion", description: "Booking conversion and funnel performance.", href: "/office/conversion", metric: "Conversion report" },
  ] },
  supervisor: { title: "Supervisor workspace", subtitle: "Assigned teams, daily schedule, attendance and service quality.", workspaces: [
    { label: "Schedule", description: "See assigned bookings and team coverage.", href: "/office/schedule", metric: "Daily schedule" },
    { label: "Bookings", description: "Review bookings within your permitted scope.", href: "/office/bookings", metric: "Booking queue" },
    { label: "Teams", description: "View and coordinate assigned teams.", href: "/office/teams", metric: "Team view" },
  ], reports: [] },
  restricted: { title: "Office workspace", subtitle: "Your account has limited Office access.", workspaces: [], reports: [] },
};

function allowed(items: Workspace[], permissions: ReadonlySet<string>): Workspace[] {
  return items.filter((item) => {
    const policy = policyForOfficePath(item.href);
    return Boolean(policy && hasAnyOfficePermission(permissions, policy.anyOf));
  });
}

function CardIcon({ href }: { href: string }) {
  const common = "h-5 w-5";
  if (href.includes("cash") || href.includes("financial") || href.includes("payout")) {
    return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><path d="M15.5 8.5c-.7-.7-1.8-1-3.2-1-1.8 0-3.1.9-3.1 2.2 0 3.4 6.4 1.5 6.4 5 0 1.4-1.4 2.3-3.4 2.3-1.5 0-2.7-.4-3.6-1.2M12 5.8v12.4"/></svg>;
  }
  if (href.includes("security")) {
    return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 19 6v5c0 4.6-2.9 7.8-7 10-4.1-2.2-7-5.4-7-10V6l7-3Z"/></svg>;
  }
  if (href.includes("ops") || href.includes("operations") || href.includes("metrics")) {
    return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>;
  }
  if (href.includes("schedule") || href.includes("booking")) {
    return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>;
  }
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/></svg>;
}

function iconTone(href: string): string {
  if (href.includes("cash") || href.includes("financial")) return "bg-emerald-50 text-emerald-700";
  if (href.includes("payout")) return "bg-violet-50 text-violet-700";
  if (href.includes("security")) return "bg-amber-50 text-amber-700";
  if (href.includes("ops") || href.includes("operations")) return "bg-blue-50 text-blue-700";
  return "bg-sky-50 text-sky-700";
}

function Grid({ items, reports = false }: { items: Workspace[]; reports?: boolean }) {
  return <div className={`grid gap-4 ${reports ? "md:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>{items.map((item) => (
    <Link key={item.href} href={item.href} className="group flex min-h-[138px] items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.035)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
      <div className="min-w-0">
        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">{item.metric}</span>
        <h3 className="mt-4 text-base font-semibold text-slate-950">{item.label}</h3>
        <p className="mt-1.5 text-sm leading-5 text-slate-500">{item.description}</p>
      </div>
      <span className={`mt-7 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconTone(item.href)} transition group-hover:scale-105`}><CardIcon href={item.href} /></span>
    </Link>
  ))}</div>;
}

export function OfficeRoleDashboard({ permissions, profile }: OfficeRoleDashboardProps) {
  const role = inferOfficeRole(permissions);
  const experience = EXPERIENCES[role];
  const workspaces = allowed(experience.workspaces, permissions);
  const reports = allowed(experience.reports, permissions);
  const roleNames = profile.roles.map((assignment) => assignment.name).join(", ") || role;

  return <main className="space-y-7" data-office-role={role}>
    <header className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 p-6 shadow-[0_4px_22px_rgba(15,23,42,0.045)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Role-based Office experience</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{experience.title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{experience.subtitle}</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">Role: {roleNames}</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">Permissions: {permissions.size}</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">Branches: {profile.branchIds.length || "Global"}</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">Teams: {profile.teamIds.length || "None"}</span>
      </div>
      {role === "supervisor" && profile.teamIds.length === 0 ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Supervisor access has no assigned team scope. Team data must remain unavailable until the Owner assigns a team.</p> : null}
    </header>
    {workspaces.length ? <section><h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-950">Your priority workspace</h2><Grid items={workspaces} /></section> : <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">No Office modules are assigned to this account.</section>}
    {reports.length ? <section><h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-950">Role reports and KPIs</h2><Grid items={reports} reports /></section> : null}
  </main>;
}
