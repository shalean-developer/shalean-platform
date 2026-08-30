"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  CalendarClock,
  Home,
  Repeat,
  FileText,
  ChevronRight,
  LayoutGrid,
  Table2,
  Sparkles,
} from "lucide-react";
import { AccountPagination } from "@/components/account/AccountPagination";
import { StatCard } from "@/components/account/StatCard";
import { HelpCard } from "@/components/account/HelpCard";
import { TrustBar } from "@/components/account/TrustBar";
import { useBookings } from "@/hooks/useBookings";
import { useReviews } from "@/hooks/useReviews";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { isUpcomingBookingRow } from "@/lib/dashboard/bookingUtils";
import { canCustomerModifyDashboardBooking } from "@/lib/dashboard/dashboardBookingOperational";
import {
  isBookingPendingCustomerReview,
  leaveReviewHrefForBooking,
} from "@/lib/dashboard/customerBookingReviewUi";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { BookingCard } from "@/components/dashboard/booking-card";
import { CustomerBookingsTable } from "@/components/dashboard/customer-bookings-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CUSTOMER_ACCOUNT_BOOK_PATH } from "@/lib/customer/customerAccountPaths";
import { cn } from "@/lib/utils";

const BOOKINGS_PER_PAGE = 5;

function QuickLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-10 items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0">{label}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function BookingsEmptyState({ kind }: { kind: "upcoming" | "past" }) {
  const upcoming = kind === "upcoming";

  return (
    <Card className="p-8 text-center">
      <div
        className={cn(
          "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
          upcoming ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <CalendarDays className="h-7 w-7" strokeWidth={1.5} aria-hidden />
      </div>
      <h3 className="font-semibold text-foreground">
        {upcoming ? "No upcoming bookings" : "No past bookings yet"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {upcoming
          ? "Schedule a clean and it will show here with reminders and cleaner updates."
          : "Completed and cancelled visits appear here."}
      </p>
      {upcoming ? (
        <Button asChild size="sm" className="mt-4 rounded-xl">
          <Link href={CUSTOMER_ACCOUNT_BOOK_PATH}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Book your next clean
          </Link>
        </Button>
      ) : null}
    </Card>
  );
}

export default function AccountBookingsPage() {
  const { bookings, loading, error, refetch, cancelBooking, rescheduleBooking } = useBookings();
  const { reviews, loading: revLoading, error: revError } = useReviews();
  const { summary, loading: summaryLoading } = useDashboardSummary();
  const [view, setView] = useState<"cards" | "table">("cards");

  const reviewedIds = useMemo(() => new Set(reviews.map((r) => r.booking_id)), [reviews]);

  const firstPendingReviewBookingId = useMemo(() => {
    if (revLoading) return null;
    const row = bookings.find((b) => isBookingPendingCustomerReview(b, reviewedIds));
    return row?.id ?? null;
  }, [bookings, reviewedIds, revLoading]);

  const pendingReviewCount = useMemo(() => {
    if (revLoading) return 0;
    return bookings.filter((b) => isBookingPendingCustomerReview(b, reviewedIds)).length;
  }, [bookings, reviewedIds, revLoading]);

  const upcoming = useMemo(
    () =>
      [...bookings]
        .filter(isUpcomingBookingRow)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [bookings],
  );

  const past = useMemo(
    () =>
      [...bookings]
        .filter((b) => !isUpcomingBookingRow(b))
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [bookings],
  );

  const [upcomingPage, setUpcomingPage] = useState(1);
  const [pastPage, setPastPage] = useState(1);

  const upcomingPageCount = Math.max(1, Math.ceil(upcoming.length / BOOKINGS_PER_PAGE));
  const pastPageCount = Math.max(1, Math.ceil(past.length / BOOKINGS_PER_PAGE));
  const safeUpcomingPage = Math.min(upcomingPage, upcomingPageCount);
  const safePastPage = Math.min(pastPage, pastPageCount);

  const pagedUpcoming = useMemo(
    () => upcoming.slice((safeUpcomingPage - 1) * BOOKINGS_PER_PAGE, safeUpcomingPage * BOOKINGS_PER_PAGE),
    [upcoming, safeUpcomingPage],
  );
  const pagedPast = useMemo(
    () => past.slice((safePastPage - 1) * BOOKINGS_PER_PAGE, safePastPage * BOOKINGS_PER_PAGE),
    [past, safePastPage],
  );

  const ym = summary?.ym ?? "";
  const bookingsThisMonthCount = summary?.bookingsThisMonthCount ?? 0;
  const completedThisMonthCount = summary?.completedThisMonthCount ?? 0;
  const hoursBookedThisMonth = summary?.hoursBookedThisMonth ?? 0;
  const totalSpentThisMonthCents = summary?.totalSpentThisMonthCents ?? 0;

  const rescheduleQuickLinkHref = useMemo(() => {
    const modifiable = upcoming.find((b) => canCustomerModifyDashboardBooking(b));
    if (modifiable) return `/account/bookings/${modifiable.id}?action=reschedule`;
    return "/account/bookings";
  }, [upcoming]);

  const tableProps = {
    reviewedIds,
    revLoading,
    detailHref: (id: string) => `/account/bookings/${id}`,
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start" aria-hidden>
        <div className="min-w-0 flex-1 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
              <div className="h-4 w-60 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-10 w-28 animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="h-12 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-52 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-52 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
        <div className="w-full shrink-0 space-y-3 xl:w-72">
          <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">My Bookings</h1>
            <p className="mt-1 text-sm text-muted-foreground">Upcoming and past cleans.</p>
          </div>
          <Button asChild className="w-full rounded-xl sm:w-auto">
            <Link href={CUSTOMER_ACCOUNT_BOOK_PATH}>Book a clean</Link>
          </Button>
        </header>

        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
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

        {revError ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Could not load reviews: {revError}
          </div>
        ) : null}

        {pendingReviewCount > 0 && firstPendingReviewBookingId ? (
          <Card className="flex flex-col gap-3 border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-amber-950">Rate your cleaning experience</p>
              <p className="mt-0.5 text-sm text-amber-800">
                {pendingReviewCount === 1
                  ? "One completed visit waiting for a quick review."
                  : `${pendingReviewCount} completed visits waiting for a quick review.`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild size="sm" className="rounded-xl">
                <Link href={`/review?booking=${encodeURIComponent(firstPendingReviewBookingId)}`}>
                  Leave a review
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="rounded-xl bg-background/70">
                <Link href="/account/reviews">All reviews</Link>
              </Button>
            </div>
          </Card>
        ) : null}

        <section className="space-y-4" aria-labelledby="booking-list-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="booking-list-heading" className="text-base font-semibold text-foreground">
                Booking history
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Switch between upcoming and past visits, then choose cards or table view.
              </p>
            </div>

            <div className="flex items-center gap-2" role="group" aria-label="Bookings view">
              <Button
                type="button"
                variant={view === "cards" ? "default" : "outline"}
                size="sm"
                className="rounded-xl"
                aria-pressed={view === "cards"}
                onClick={() => setView("cards")}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
                Cards
              </Button>
              <Button
                type="button"
                variant={view === "table" ? "default" : "outline"}
                size="sm"
                className="rounded-xl"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <Table2 className="h-4 w-4" aria-hidden />
                Table
              </Button>
            </div>
          </div>

          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-xl border border-border bg-card p-1 shadow-sm sm:inline-grid sm:w-auto">
              <TabsTrigger
                value="upcoming"
                className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Upcoming
                {upcoming.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                    {upcoming.length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Past
                {past.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                    {past.length}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4">
              {upcoming.length === 0 ? (
                <BookingsEmptyState kind="upcoming" />
              ) : view === "cards" ? (
                <>
                  <ul className="space-y-4">
                    {pagedUpcoming.map((b) => (
                      <li key={b.id}>
                        <BookingCard
                          booking={b}
                          detailHref={`/account/bookings/${b.id}`}
                          onCancel={cancelBooking}
                          onReschedule={rescheduleBooking}
                        />
                      </li>
                    ))}
                  </ul>
                  <AccountPagination
                    page={safeUpcomingPage}
                    pageCount={upcomingPageCount}
                    onPage={setUpcomingPage}
                    label="Upcoming bookings pagination"
                  />
                </>
              ) : (
                <>
                  <CustomerBookingsTable bookings={pagedUpcoming} {...tableProps} />
                  <AccountPagination
                    page={safeUpcomingPage}
                    pageCount={upcomingPageCount}
                    onPage={setUpcomingPage}
                    label="Upcoming bookings pagination"
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="past" className="mt-4">
              {past.length === 0 ? (
                <BookingsEmptyState kind="past" />
              ) : view === "cards" ? (
                <>
                  <ul className="space-y-4">
                    {pagedPast.map((b) => (
                      <li key={b.id}>
                        <BookingCard
                          booking={b}
                          detailHref={`/account/bookings/${b.id}`}
                          leaveReviewHref={leaveReviewHrefForBooking(b, reviewedIds, revLoading)}
                          onCancel={cancelBooking}
                          onReschedule={rescheduleBooking}
                        />
                      </li>
                    ))}
                  </ul>
                  <AccountPagination
                    page={safePastPage}
                    pageCount={pastPageCount}
                    onPage={setPastPage}
                    label="Past bookings pagination"
                  />
                </>
              ) : (
                <>
                  <CustomerBookingsTable bookings={pagedPast} {...tableProps} />
                  <AccountPagination
                    page={safePastPage}
                    pageCount={pastPageCount}
                    onPage={setPastPage}
                    label="Past bookings pagination"
                  />
                </>
              )}
            </TabsContent>
          </Tabs>
        </section>

        <TrustBar />
      </div>

      <aside className="w-full shrink-0 space-y-3 xl:w-72" aria-label="Booking account shortcuts">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">This month overview</h2>
          {summaryLoading ? (
            <div className="grid grid-cols-2 gap-2" aria-hidden>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                compact
                icon={CalendarDays}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                value={bookingsThisMonthCount}
                label="Bookings"
                sublabel={ym ? `in ${ym}` : "this month"}
              />
              <StatCard
                compact
                icon={CheckCircle2}
                iconBg="bg-green-100"
                iconColor="text-green-600"
                value={completedThisMonthCount}
                label="Completed"
                sublabel="this month"
              />
              <StatCard
                compact
                icon={Clock}
                iconBg="bg-orange-100"
                iconColor="text-orange-500"
                value={hoursBookedThisMonth}
                label="Hours booked"
                sublabel="this month"
              />
              <StatCard
                compact
                icon={DollarSign}
                iconBg="bg-violet-100"
                iconColor="text-violet-600"
                value={formatZarFromCents(totalSpentThisMonthCents)}
                label="Total spent"
                sublabel="this month"
              />
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Quick links</h2>
          <div className="divide-y divide-border">
            <QuickLink href={rescheduleQuickLinkHref} label="Reschedule a booking" icon={CalendarClock} />
            <QuickLink href="/account/addresses" label="Add a new property" icon={Home} />
            <QuickLink href="/account/recurring" label="Manage recurring plans" icon={Repeat} />
            <QuickLink href="/account/invoices" label="View all invoices" icon={FileText} />
          </div>
        </Card>

        <HelpCard compact />
      </aside>
    </div>
  );
}
