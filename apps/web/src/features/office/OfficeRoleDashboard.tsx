"use client";

import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  HeartHandshake,
  Megaphone,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { inferOfficeRole, policyForOfficePath, hasAnyOfficePermission, type OfficeRoleKey } from "@/lib/admin/officeExperience";

export type OfficeRoleDashboardProps = {
  permissions: ReadonlySet<string>;
};

type WorkspaceCard = {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  metricLabel: string;
};

type RoleExperience = {
  title: string;
  subtitle: string;
  cards: WorkspaceCard[];
  reports: WorkspaceCard[];
};

const EXPERIENCES: Record<OfficeRoleKey, RoleExperience> = {
  owner: {
    title: "Owner command centre",
    subtitle: "Company-wide control, financial visibility, risk oversight and administration.",
    cards: [
      { label: "Business health", description: "Revenue, margin and operating position.", href: "/office/business-health", icon: BarChart3, metricLabel: "Executive KPI" },
      { label: "Cash flow", description: "Cash movement and liquidity view.", href: "/office/cash-flow", icon: CircleDollarSign, metricLabel: "Finance KPI" },
      { label: "Payout approvals", description: "Maker-checker approval queue.", href: "/office/payouts/approvals", icon: CheckCircle2, metricLabel: "Control queue" },
      { label: "Security", description: "Roles, permissions and audit controls.", href: "/office/security", icon: ShieldCheck, metricLabel: "Risk control" },
    ],
    reports: [
      { label: "Booking profitability", description: "Revenue and cost by booking.", href: "/office/booking-profitability", icon: FileText, metricLabel: "Profit report" },
      { label: "Operations health", description: "Service reliability and operational exceptions.", href: "/office/ops-health", icon: ClipboardList, metricLabel: "Operations report" },
    ],
  },
  manager: {
    title: "General Manager workspace",
    subtitle: "Cross-functional performance, exceptions, approvals and service delivery.",
    cards: [
      { label: "Operations", description: "Daily service delivery and exception management.", href: "/office/operations", icon: ClipboardList, metricLabel: "Daily KPI" },
      { label: "Schedule", description: "Bookings, allocation and team coverage.", href: "/office/schedule", icon: Calendar, metricLabel: "Coverage KPI" },
      { label: "Business health", description: "Management-level financial summary.", href: "/office/business-health", icon: BarChart3, metricLabel: "Management KPI" },
      { label: "Customers", description: "Customer issues, retention and service recovery.", href: "/office/customers", icon: HeartHandshake, metricLabel: "Customer KPI" },
    ],
    reports: [
      { label: "Cleaner performance", description: "Workforce quality and reliability.", href: "/office/cleaner-performance", icon: Users, metricLabel: "Workforce report" },
      { label: "Analytics", description: "Growth and conversion performance.", href: "/office/analytics", icon: BarChart3, metricLabel: "Growth report" },
    ],
  },
  operations: {
    title: "Operations workspace",
    subtitle: "Today's bookings, allocation, incidents and service-delivery health.",
    cards: [
      { label: "Schedule", description: "Monitor today's work and team coverage.", href: "/office/schedule", icon: Calendar, metricLabel: "Today's coverage" },
      { label: "Bookings", description: "Manage booking progress and assignments.", href: "/office/bookings", icon: BookOpen, metricLabel: "Booking queue" },
      { label: "Ops queue", description: "Resolve operational exceptions.", href: "/office/ops-queue", icon: ClipboardList, metricLabel: "Exception queue" },
      { label: "SLA breaches", description: "Prioritise overdue service actions.", href: "/office/sla-breaches", icon: ShieldCheck, metricLabel: "SLA KPI" },
    ],
    reports: [
      { label: "Cleaner performance", description: "Quality and reliability trends.", href: "/office/cleaner-performance", icon: Users, metricLabel: "Quality report" },
      { label: "Dispatch metrics", description: "Allocation and response performance.", href: "/office/metrics", icon: BarChart3, metricLabel: "Dispatch report" },
    ],
  },
  finance: {
    title: "Finance workspace",
    subtitle: "Cash, expenses, reconciliation, profitability and payout preparation.",
    cards: [
      { label: "Financial dashboard", description: "Current financial performance summary.", href: "/office/financial-dashboard", icon: BarChart3, metricLabel: "Finance KPI" },
      { label: "Cash flow", description: "Monitor inflows, outflows and liquidity.", href: "/office/cash-flow", icon: CircleDollarSign, metricLabel: "Cash KPI" },
      { label: "Expenses", description: "Review and manage business expenditure.", href: "/office/expenses", icon: FileText, metricLabel: "Expense queue" },
      { label: "Payouts", description: "Prepare and review cleaner payout records.", href: "/office/payouts", icon: Wallet, metricLabel: "Payout queue" },
    ],
    reports: [
      { label: "Booking profitability", description: "Margin by booking and service.", href: "/office/booking-profitability", icon: FileText, metricLabel: "Profit report" },
      { label: "Payment reconciliation", description: "Match payments, invoices and records.", href: "/office/payment-reconciliation", icon: CheckCircle2, metricLabel: "Reconciliation report" },
    ],
  },
  "customer-care": {
    title: "Customer Care workspace",
    subtitle: "Customer records, booking support, reviews and service recovery.",
    cards: [
      { label: "Customers", description: "Find and support customer accounts.", href: "/office/customers", icon: HeartHandshake, metricLabel: "Customer queue" },
      { label: "Bookings", description: "Review booking details and customer requests.", href: "/office/bookings", icon: BookOpen, metricLabel: "Support queue" },
      { label: "Reviews", description: "Monitor feedback and follow-up needs.", href: "/office/reviews", icon: CheckCircle2, metricLabel: "Review KPI" },
      { label: "Notifications", description: "Send approved customer communications.", href: "/office/notifications", icon: Megaphone, metricLabel: "Communication tool" },
    ],
    reports: [
      { label: "Review funnel", description: "Track review requests and outcomes.", href: "/office/review-funnel", icon: BarChart3, metricLabel: "Customer report" },
      { label: "Notification logs", description: "Confirm delivery and communication history.", href: "/office/notification-logs", icon: FileText, metricLabel: "Delivery report" },
    ],
  },
  workforce: {
    title: "Workforce workspace",
    subtitle: "Cleaner records, applications, teams, availability and performance.",
    cards: [
      { label: "Cleaners", description: "Manage cleaner profiles and availability.", href: "/office/cleaners", icon: Users, metricLabel: "Workforce KPI" },
      { label: "Teams", description: "Build and maintain operating teams.", href: "/office/teams", icon: Users, metricLabel: "Team coverage" },
      { label: "Applications", description: "Review cleaner applications.", href: "/office/cleaner-applications", icon: ClipboardList, metricLabel: "Application queue" },
      { label: "Schedule", description: "Review workforce demand and coverage.", href: "/office/schedule", icon: Calendar, metricLabel: "Capacity KPI" },
    ],
    reports: [
      { label: "Cleaner performance", description: "Reliability, quality and booking activity.", href: "/office/cleaner-performance", icon: BarChart3, metricLabel: "Performance report" },
      { label: "Cleaner feedback", description: "Reports, feedback and follow-up actions.", href: "/office/cleaner-report-feedback", icon: FileText, metricLabel: "Feedback report" },
    ],
  },
  marketing: {
    title: "Marketing workspace",
    subtitle: "Campaigns, content, conversion, SEO and channel performance.",
    cards: [
      { label: "Marketing", description: "Campaign performance and growth overview.", href: "/office/marketing", icon: Megaphone, metricLabel: "Marketing KPI" },
      { label: "Campaigns", description: "Plan and manage active campaigns.", href: "/office/marketing/campaigns", icon: Megaphone, metricLabel: "Campaign queue" },
      { label: "Blog", description: "Draft and publish governed content.", href: "/office/blog", icon: FileText, metricLabel: "Content queue" },
      { label: "SEO insights", description: "Search visibility and content opportunities.", href: "/office/seo-insights", icon: BarChart3, metricLabel: "SEO KPI" },
    ],
    reports: [
      { label: "Campaign analytics", description: "Channel and campaign results.", href: "/office/marketing/analytics", icon: BarChart3, metricLabel: "Campaign report" },
      { label: "Conversion", description: "Booking conversion and funnel performance.", href: "/office/conversion", icon: FileText, metricLabel: "Conversion report" },
    ],
  },
  supervisor: {
    title: "Supervisor workspace",
    subtitle: "Assigned teams, daily schedule, attendance and service quality.",
    cards: [
      { label: "Schedule", description: "See assigned bookings and team coverage.", href: "/office/schedule", icon: Calendar, metricLabel: "Daily schedule" },
      { label: "Bookings", description: "Review bookings within your permitted scope.", href: "/office/bookings", icon: BookOpen, metricLabel: "Booking queue" },
      { label: "Teams", description: "View and coordinate assigned teams.", href: "/office/teams", icon: Users, metricLabel: "Team view" },
      { label: "Cleaner performance", description: "Monitor quality within your team scope.", href: "/office/cleaner-performance", icon: CheckCircle2, metricLabel: "Quality KPI" },
    ],
    reports: [
      { label: "Cleaner feedback", description: "Submit and review permitted feedback.", href: "/office/cleaner-report-feedback", icon: FileText, metricLabel: "Feedback report" },
    ],
  },
  restricted: {
    title: "Office workspace",
    subtitle: "Your account has limited Office access.",
    cards: [],
    reports: [],
  },
};

function allowedCards(cards: WorkspaceCard[], permissions: ReadonlySet<string>): WorkspaceCard[] {
  return cards.filter((card) => {
    const policy = policyForOfficePath(card.href);
    return !policy || hasAnyOfficePermission(permissions, policy.anyOf);
  });
}

function WorkspaceGrid({ cards, permissions }: { cards: WorkspaceCard[]; permissions: ReadonlySet<string> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {allowedCards(cards, permissions).map((card) => {
        const Icon = card.icon;
        return (
          <Link key={card.href} href={card.href} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-lg bg-blue-50 p-2.5 text-blue-700"><Icon className="h-5 w-5" /></span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{card.metricLabel}</span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">{card.label}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">{card.description}</p>
          </Link>
        );
      })}
    </div>
  );
}

export function OfficeRoleDashboard({ permissions }: OfficeRoleDashboardProps) {
  const role = inferOfficeRole(permissions);
  const experience = EXPERIENCES[role];
  const visibleCards = allowedCards(experience.cards, permissions);
  const visibleReports = allowedCards(experience.reports, permissions);

  return (
    <main className="space-y-7" data-office-role={role}>
      <header className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Role-based Office experience</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">{experience.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{experience.subtitle}</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Role: {role}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Visible workspaces: {visibleCards.length + visibleReports.length}</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Permissions: {permissions.size}</span>
        </div>
      </header>

      {visibleCards.length > 0 ? (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div><h2 className="text-lg font-semibold text-slate-900">Your priority workspace</h2><p className="text-sm text-slate-500">Only modules permitted for your role are shown.</p></div>
          </div>
          <WorkspaceGrid cards={experience.cards} permissions={permissions} />
        </section>
      ) : (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">No Office modules are currently assigned to this account. Ask the Owner to review your role assignment.</section>
      )}

      {visibleReports.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Role reports and KPIs</h2>
          <WorkspaceGrid cards={experience.reports} permissions={permissions} />
        </section>
      ) : null}
    </main>
  );
}
