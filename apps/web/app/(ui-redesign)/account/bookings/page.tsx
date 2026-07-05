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
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table2,
  Sparkles,
} from "lucide-react";
import { StatCard } from "@/components/account/StatCard";
import { HelpCard } from "@/components/account/HelpCard";
import { TrustBar } from "@/components/account/TrustBar";
import { useBookings } from "@/hooks/useBookings";
import { useReviews } from "@/hooks/useReviews";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { isUpcomingBookingRow } from "@/lib/dashboard/bookingUtils";
import {
  canCustomerModifyDashboardBooking,
} from "@/lib/dashboard/dashboardBookingOperational";
import {
  isBookingPendingCustomerReview,
  leaveReviewHrefForBooking,
} from "@/lib/dashboard/customerBookingReviewUi";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { BookingCard } from "@/components/dashboard/booking-card";
import { CustomerBookingsTable } from "@/components/dashboard/customer-bookings-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CUSTOMER_ACCOUNT_BOOK_PATH } from "@/lib/customer/customerAccountPaths";
import { cn } from "@/lib/utils";


const BOOKINGS_PER_PAGE = 5;

function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Bookings pagination">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Previous
      </Button>
      <span className="text-sm text-gray-500">
        Page {page} of {pageCount}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Next
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </nav>
  );
}

function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number; }> }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg px-2 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
    >
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-blue-500" strokeWidth={1.75} />
        {label}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
    </Link>
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
      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="flex-1 space-y-4">
          <div className="h-10 w-48 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
        </div>
        <div className="w-full animate-pulse space-y-4 xl:w-64">
          <div className="h-48 rounded-2xl bg-gray-100" />
          <div className="h-40 rounded-2xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      {/* ── Left column: bookings ─────────────────────────────────── */}
      <div className="min-w-0 flex-1 space-y-5">
        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Bookings</h1>
            <p className="mt-1 text-sm text-gray-500">Upcoming and past cleans.</p>
          </div>
          <Button
            asChild
            className="rounded-xl bg-blue-600 px-5 text-white shadow-sm hover:bg-blue-700"
          >
            <Link href={CUSTOMER_ACCOUNT_BOOK_PATH}>Book a clean</Link>
          </Button>
        </div>

        {/* Error banner */}
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {revError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Could not load reviews: {revError}
          </div>
        ) : null}

        {/* Pending review banner */}
        {pendingReviewCount > 0 && firstPendingReviewBookingId ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-amber-900">Rate your cleaning experience</p>
              <p className="mt-0.5 text-sm text-amber-700/90">
                {pendingReviewCount === 1
                  ? "One completed visit waiting for a quick review."
                  : `${pendingReviewCount} completed visits waiting for a quick review.`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                asChild
                size="sm"
                className="rounded-xl bg-amber-600 text-white hover:bg-amber-700"
              >
                <Link href={`/review?booking=${encodeURIComponent(firstPendingReviewBookingId)}`}>
                  Leave a review
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="rounded-xl">
                <Link href="/account/reviews">All reviews</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {/* View toggle + Tabs */}
        <div className="space-y-4">
          {/* View toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView("cards")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition",
                view === "cards"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
              )}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition",
                view === "table"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
              )}
            >
              <Table2 className="h-4 w-4" strokeWidth={1.75} />
              Table
            </button>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="inline-flex rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
              <TabsTrigger
                value="upcoming"
                className="rounded-lg px-5 py-2 text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                Upcoming
                {upcoming.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums data-[state=active]:bg-white/20">
                    {upcoming.length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="rounded-lg px-5 py-2 text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                Past
                {past.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums data-[state=active]:bg-white/20">
                    {past.length}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4">
              {upcoming.length === 0 ? (
                <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                    <CalendarDays className="h-7 w-7 text-blue-500" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-semibold text-gray-900">No upcoming bookings</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Schedule a clean and it will show here with reminders and cleaner updates.
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className="mt-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Link href={CUSTOMER_ACCOUNT_BOOK_PATH}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Book your next clean
                    </Link>
                  </Button>
                </div>
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
                  <Pagination
                    page={safeUpcomingPage}
                    pageCount={upcomingPageCount}
                    onPage={setUpcomingPage}
                  />
                </>
              ) : (
                <>
                  <CustomerBookingsTable bookings={pagedUpcoming} {...tableProps} />
                  <Pagination
                    page={safeUpcomingPage}
                    pageCount={upcomingPageCount}
                    onPage={setUpcomingPage}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="past" className="mt-4">
              {past.length === 0 ? (
                <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
                    <CalendarDays className="h-7 w-7 text-gray-400" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-semibold text-gray-900">No past bookings yet</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Completed and cancelled visits appear here.
                  </p>
                </div>
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
                  <Pagination page={safePastPage} pageCount={pastPageCount} onPage={setPastPage} />
                </>
              ) : (
                <>
                  <CustomerBookingsTable bookings={pagedPast} {...tableProps} />
                  <Pagination page={safePastPage} pageCount={pastPageCount} onPage={setPastPage} />
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Trust bar */}
        <TrustBar />
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────── */}
      <div className="w-full shrink-0 space-y-3 xl:w-64">
        {/* This month overview */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">This month overview</h2>
          {summaryLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
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
        </div>

        {/* Quick links */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-gray-900">Quick links</h2>
          <div className="divide-y divide-gray-50">
            <QuickLink href={rescheduleQuickLinkHref} label="Reschedule a booking" icon={CalendarClock} />
            <QuickLink href="/account/addresses" label="Add a new property" icon={Home} />
            <QuickLink href="/account/recurring" label="Manage recurring plans" icon={Repeat} />
            <QuickLink href="/account/invoices" label="View all invoices" icon={FileText} />
          </div>
        </div>

        {/* Help card */}
        <HelpCard compact />
      </div>
    </div>
  );
}
