"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  CalendarClock,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Home,
  MapPin,
  Receipt,
  Repeat,
  Sparkles,
  Wallet,
} from "lucide-react";
import { TrustBar } from "@/components/account/TrustBar";
import { HelpCard } from "@/components/account/HelpCard";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useAddresses } from "@/hooks/useAddresses";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { customerMonthlyInvoiceStatusLabel } from "@/lib/dashboard/monthlyInvoiceUi";
import { invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";
import { BookingCard } from "@/components/dashboard/booking-card";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  {
    href: "/account/book",
    icon: Sparkles,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Book a clean",
    description: "Schedule a new cleaning",
  },
  {
    href: "/account/bookings",
    icon: CalendarDays,
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    title: "All bookings",
    description: "View your bookings",
  },
  {
    href: "/account/recurring",
    icon: Repeat,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    title: "Recurring plans",
    description: "Manage recurring cleans",
  },
  {
    href: "/account/invoices",
    icon: FileText,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    title: "Invoices",
    description: "View and download",
  },
];

function formatTimeRange(time: string, durationHours: number | null, scheduleConfirmed = true): string {
  if (!scheduleConfirmed || !time?.trim() || !/^\d{1,2}:\d{2}$/.test(time.trim())) {
    return "Time to be confirmed";
  }
  if (durationHours == null || !Number.isFinite(durationHours) || durationHours <= 0) {
    return "Time to be confirmed";
  }
  try {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr ?? "0", 10);
    const m = parseInt(mStr ?? "0", 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "Time to be confirmed";
    const startDate = new Date(2000, 0, 1, h, m);
    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
    return `${fmt(startDate)} – ${fmt(endDate)} (${durationHours} hrs)`;
  } catch {
    return "Time to be confirmed";
  }
}

function formatBookingDate(date: string): string {
  try {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-ZA", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return date;
  }
}

function getServiceGradient(serviceName: string): string {
  const n = (serviceName ?? "").toLowerCase();
  if (n.includes("office") || n.includes("commercial")) return "from-teal-500 to-cyan-600";
  if (n.includes("deep") || n.includes("spring")) return "from-purple-500 to-violet-600";
  if (n.includes("move") || n.includes("vacate")) return "from-amber-400 to-orange-500";
  if (n.includes("carpet") || n.includes("upholstery")) return "from-rose-400 to-pink-500";
  if (n.includes("window")) return "from-sky-400 to-blue-500";
  if (n.includes("airbnb")) return "from-pink-400 to-rose-500";
  return "from-blue-500 to-indigo-600";
}

function formatAddress(addressLine: string | null | undefined, suburb: string | null | undefined): string {
  const parts = [addressLine, suburb]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0 && p !== "—");
  return parts.filter((p, i) => parts.indexOf(p) === i).join(", ");
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-base font-semibold text-foreground">{children}</h2>;
}

function StatCard({
  icon: Icon,
  iconClassName,
  iconSurfaceClassName,
  value,
  label,
  detail,
}: {
  icon: typeof CalendarDays;
  iconClassName: string;
  iconSurfaceClassName: string;
  value: React.ReactNode;
  label: string;
  detail: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 p-4">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconSurfaceClassName)}>
        <Icon className={cn("h-5 w-5", iconClassName)} strokeWidth={1.75} />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-foreground">{label}</p>
      <p className="text-xs leading-snug text-muted-foreground">{detail}</p>
    </Card>
  );
}

export default function AccountHomePage() {
  const { summary, loading, error, refetch } = useDashboardSummary();
  const { addresses, loading: addrLoading, error: addrError } = useAddresses();

  const ym = summary?.ym ?? "";
  const nextBooking = summary?.nextBooking ?? null;
  const recent = useMemo(() => summary?.recentBookings ?? [], [summary]);
  const bookingsThisMonthCount = summary?.bookingsThisMonthCount ?? 0;
  const hoursBookedThisMonth = summary?.hoursBookedThisMonth ?? 0;
  const completedCount = summary?.completedThisMonthCount ?? 0;
  const totalSpentCents = summary?.totalSpentThisMonthCents ?? 0;
  const perVisitInvoices = useMemo(() => summary?.perVisitInvoices ?? [], [summary]);
  const invoiceThisMonth = summary?.invoiceThisMonth ?? null;
  const hasAnyInvoices = summary?.hasAnyInvoices ?? false;
  const isOverdue = summary?.isOverdue ?? false;
  const daysOverdue = summary?.daysOverdue ?? 0;
  const hasOverdueInvoice = summary?.hasOverdueInvoice ?? false;

  const balanceCents =
    invoiceThisMonth &&
    typeof invoiceThisMonth.balance_cents === "number" &&
    Number.isFinite(invoiceThisMonth.balance_cents)
      ? invoiceThisMonth.balance_cents
      : invoiceThisMonth
        ? Math.max(0, invoiceThisMonth.total_amount_cents - invoiceThisMonth.amount_paid_cents)
        : 0;

  const defaultAddr = useMemo(() => addresses.find((a) => a.is_default) ?? addresses[0], [addresses]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6" aria-label="Loading account overview">
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-[var(--ui-radius-lg)] border border-border bg-card" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <div className="h-48 rounded-[var(--ui-radius-lg)] border border-border bg-card" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 rounded-[var(--ui-radius-lg)] border border-border bg-card" />
              ))}
            </div>
            <div className="h-40 rounded-[var(--ui-radius-lg)] border border-border bg-card" />
          </div>
          <div className="space-y-4">
            <div className="h-44 rounded-[var(--ui-radius-lg)] border border-border bg-card" />
            <div className="h-44 rounded-[var(--ui-radius-lg)] border border-border bg-card" />
            <div className="h-28 rounded-[var(--ui-radius-lg)] border border-border bg-card" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {error ? (
        <div className="rounded-[var(--ui-radius-lg)] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}{" "}
          <button
            type="button"
            className="font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <section aria-label="Account quick actions">
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ href, icon: Icon, iconBg, iconColor, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-20 items-start gap-3 rounded-[var(--ui-radius-lg)] border border-border bg-card p-4 text-card-foreground shadow-[var(--ui-shadow-sm)] transition hover:border-primary/30 hover:shadow-[var(--ui-shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                <Icon className={cn("h-5 w-5", iconColor)} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-semibold leading-tight text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:text-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <section>
            <SectionHeading>Upcoming booking</SectionHeading>
            {nextBooking ? (
              <Card className="overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  <div
                    className={cn(
                      "relative h-36 w-full shrink-0 overflow-hidden sm:h-auto sm:w-40 md:w-48",
                      `bg-gradient-to-br ${getServiceGradient(nextBooking.serviceName)}`,
                    )}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                        <CalendarClock className="h-6 w-6 text-white" strokeWidth={1.5} />
                      </div>
                      <span className="text-center text-xs font-semibold leading-tight text-white/90">
                        {nextBooking.serviceName}
                      </span>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between p-5">
                    <div className="space-y-3">
                      <CustomerBookingStatusBadge booking={nextBooking} />
                      <p className="text-lg font-bold text-foreground">{nextBooking.serviceName}</p>
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                          <span>{formatBookingDate(nextBooking.date)}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                          <span>{formatTimeRange(nextBooking.time, nextBooking.durationHours, nextBooking.scheduleConfirmed)}</span>
                        </div>
                        {formatAddress(nextBooking.addressLine, nextBooking.suburb) ? (
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                            <span>{formatAddress(nextBooking.addressLine, nextBooking.suburb)}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button asChild size="sm">
                        <Link href={`/account/bookings/${nextBooking.id}`}>View details</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="flex flex-col items-center justify-center border-dashed p-8 text-center sm:p-10">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <CalendarDays className="h-7 w-7 text-primary" strokeWidth={1.5} aria-hidden />
                </div>
                <p className="mt-4 font-semibold text-foreground">No upcoming cleans</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Book your next visit in a few taps.</p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/account/book">Book a clean</Link>
                </Button>
              </Card>
            )}
          </section>

          <section>
            <SectionHeading>This month overview</SectionHeading>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={CalendarDays}
                iconSurfaceClassName="bg-blue-100"
                iconClassName="text-blue-600"
                value={bookingsThisMonthCount}
                label="Bookings"
                detail={<>in {ym || "this month"}</>}
              />
              <StatCard
                icon={CheckCircle2}
                iconSurfaceClassName="bg-green-100"
                iconClassName="text-green-600"
                value={completedCount}
                label="Completed"
                detail="bookings"
              />
              <StatCard
                icon={Clock}
                iconSurfaceClassName="bg-orange-100"
                iconClassName="text-orange-500"
                value={hoursBookedThisMonth}
                label="Hours booked"
                detail="this month"
              />
              <StatCard
                icon={Wallet}
                iconSurfaceClassName="bg-violet-100"
                iconClassName="text-violet-600"
                value={formatZarFromCents(totalSpentCents)}
                label="Total spent"
                detail="this month"
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">Recent bookings</h2>
              <Link
                href="/account/bookings"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                View all bookings
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {recent.length === 0 ? (
              <Card className="flex flex-col items-center justify-center p-8 text-center sm:p-10">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <CalendarX2 className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                </div>
                <p className="mt-4 font-semibold text-foreground">No bookings yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Once you book a clean, your bookings will appear here.
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/account/book">Book your first clean</Link>
                </Button>
              </Card>
            ) : (
              <ul className="space-y-3">
                {recent.map((b) => (
                  <li key={b.id}>
                    <BookingCard booking={b} showActions={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Account summaries and support">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Invoice summary</h2>
              <Link
                href="/account/invoices"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                View all invoices <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            <div className="p-5">
              {invoiceThisMonth ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {invoiceThisMonth.month} · {customerMonthlyInvoiceStatusLabel(invoiceThisMonth.status)}
                    </p>
                    {isOverdue ? (
                      <Badge variant="destructive" className="text-[10px] uppercase">Overdue</Badge>
                    ) : null}
                  </div>
                  {isOverdue ? (
                    <p className="mt-2 text-xs text-amber-700">{invoiceOverdueEscalationText(daysOverdue)}</p>
                  ) : null}
                  {hasOverdueInvoice && !isOverdue ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      You have an overdue invoice —{" "}
                      <Link href="/account/invoices" className="font-medium text-primary underline">view invoices</Link>.
                    </p>
                  ) : null}
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Total</dt>
                      <dd className="font-semibold tabular-nums text-foreground">{formatZarFromCents(invoiceThisMonth.total_amount_cents)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Paid</dt>
                      <dd className="font-semibold tabular-nums text-foreground">{formatZarFromCents(invoiceThisMonth.amount_paid_cents)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Balance</dt>
                      <dd className={cn("font-semibold tabular-nums", balanceCents > 0 ? "text-destructive" : "text-foreground")}>
                        {formatZarFromCents(balanceCents)}
                      </dd>
                    </div>
                  </dl>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                    <Link href={`/account/invoices/${invoiceThisMonth.id}`}>View invoice</Link>
                  </Button>
                </>
              ) : perVisitInvoices.length > 0 ? (
                <>
                  <ul className="space-y-2.5">
                    {perVisitInvoices.map((inv) => (
                      <li key={inv.bookingId}>
                        <Link
                          href={`/account/bookings/${inv.bookingId}`}
                          className="flex items-center justify-between gap-2 rounded-[var(--ui-radius-md)] border border-border px-3 py-2.5 transition hover:border-primary/30 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{inv.serviceName}</p>
                            <p className="text-xs text-muted-foreground">Per-visit · Paid</p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                            R {inv.amountZar.toLocaleString("en-ZA")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                    <Link href="/account/invoices">View all invoices</Link>
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center py-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <Receipt className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">No invoice yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Your invoices will appear here once you complete a paid clean.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                    <Link href="/account/invoices">
                      {hasAnyInvoices ? "View past invoices" : "View invoices"}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">My properties</h2>
              <Link
                href="/account/addresses"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                View all <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            <div className="p-5">
              {addrError ? (
                <p className="text-sm text-destructive" role="alert">{addrError}</p>
              ) : addrLoading ? (
                <div className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden />
              ) : defaultAddr ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Home className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          {defaultAddr.label || "Home"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          Primary
                        </span>
                      </div>
                      <p className="mt-2 break-words text-sm font-medium text-foreground">{defaultAddr.line1}</p>
                      <p className="break-words text-sm text-muted-foreground">
                        {defaultAddr.suburb}, {defaultAddr.city} {defaultAddr.postal_code}
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                    <Link href="/account/addresses">Manage properties</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Save properties to book faster.</p>
                  <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                    <Link href="/account/addresses">Add a property</Link>
                  </Button>
                </>
              )}
            </div>
          </Card>

          <HelpCard />
        </aside>
      </div>

      <section className="pt-2" aria-label="Shalean service assurances">
        <TrustBar />
      </section>
    </div>
  );
}
