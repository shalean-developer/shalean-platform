"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleHelp, RefreshCw } from "lucide-react";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import {
  earningsWorkspaceSchema,
  earningsDateLabel,
  monthLabel,
  EARNING_STATE_LABEL,
  type EarningsWorkspace,
} from "@/lib/cleaner/earningsWorkspaceContract";
import { PAYOUT_PROCESSING_START_YMD } from "@/lib/payout/payoutProcessingCutoff";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2";
const BUTTON = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-50 ${FOCUS}`;
const PAGE_SIZE = 10;
function money(cents: number | null) {
  return cents == null ? "Unavailable" : formatZarFromCents(cents);
}
function MoneyRow({
  label,
  cents,
  hint,
}: {
  label: string;
  cents: number | null;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
      </div>
      <p className="text-base font-bold tabular-nums text-slate-950">
        {money(cents)}
      </p>
    </div>
  );
}
function Pagination({
  page,
  total,
  onPage,
  label,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return null;
  return (
    <nav
      aria-label={`${label} pages`}
      className="mt-4 flex flex-wrap items-center justify-between gap-2"
    >
      <button
        type="button"
        className={BUTTON}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span className="text-sm text-slate-700">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className={BUTTON}
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

export function EarningsWorkspaceView({
  data,
  refreshing,
  error,
  onRefresh,
  onMonthChange,
}: {
  data: EarningsWorkspace;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onMonthChange: (month: string) => void;
}) {
  const [tab, setTab] = useState<"earnings" | "payments">("earnings");
  const [search, setSearch] = useState("");
  const [earningPage, setEarningPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const selected = monthLabel(data.month);
  const historical = data.month < PAYOUT_PROCESSING_START_YMD.slice(0, 7);
  const open = data.month >= data.today.slice(0, 7);
  const nextMonth = new Date(`${data.month}-01T12:00:00+02:00`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const closeLabel = earningsDateLabel(nextMonth.toISOString(), true);
  const query = search.trim().toLowerCase();
  const filtered = data.earnings.filter((row) =>
    `${row.service} ${row.reference} ${row.date ?? ""}`
      .toLowerCase()
      .includes(query),
  );
  const visiblePage = Math.min(
    earningPage,
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  );
  const visiblePaymentPage = Math.min(
    paymentPage,
    Math.max(1, Math.ceil(data.payments.length / PAGE_SIZE)),
  );
  const updated = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(data.as_of));
  return (
    <main
      className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-8 pt-4"
      aria-busy={refreshing}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Earnings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Your work, earnings and recorded payments.
          </p>
        </div>
        <Link
          href="/jobs/profile/help"
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-blue-800 ${FOCUS}`}
        >
          <CircleHelp className="size-4" aria-hidden />
          Get help
        </Link>
      </header>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="earnings-month"
            className="mb-1 block text-sm font-semibold text-slate-800"
          >
            Earnings month
          </label>
          <select
            id="earnings-month"
            className={`min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 ${FOCUS}`}
            value={data.month}
            disabled={refreshing}
            onChange={(event) => {
              setEarningPage(1);
              setPaymentPage(1);
              onMonthChange(event.target.value);
            }}
          >
            {data.months.map((month) => (
              <option value={month} key={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={BUTTON}
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw
            className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
        >
          {error} Showing the last successful figures from {updated}.
        </div>
      ) : null}
      <section
        aria-labelledby="month-earnings"
        className="rounded-2xl bg-blue-800 p-5 text-white shadow-sm"
      >
        <h2 id="month-earnings" className="text-sm font-semibold">
          {selected} earnings
        </h2>
        <p className="mt-2 break-words text-3xl font-extrabold tabular-nums [overflow-wrap:anywhere] sm:text-4xl">
          {money(data.period.earned_cents)}
        </p>
        <p className="mt-2 text-sm text-blue-100">
          {data.period.completed_visits} completed cleaner{" "}
          {data.period.completed_visits === 1 ? "visit" : "visits"} · earned
          amount
        </p>
        <p className="mt-4 inline-block rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-900">
          {historical
            ? "Historical period"
            : open
              ? "Month open"
              : "Month closed"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-blue-50">
          {historical
            ? "Earlier earnings are preserved for historical review. They are separate from current payout processing."
            : open
              ? `Earnings are still accumulating. Payout review can start after the month closes on ${closeLabel}. Payment follows the required checks and approval.`
              : "The month has closed. Earnings are reviewed, funding is checked and payment is approved before a transfer is recorded."}
        </p>
      </section>
      {data.period.unavailable_visits > 0 ? (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
        >
          {data.period.unavailable_visits} visit amount(s) need review. The
          total is unavailable until these amounts are confirmed.
        </p>
      ) : null}
      {data.undated_visits > 0 ? (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
        >
          {data.undated_visits} completed visit(s) have no confirmed date. They
          remain in lifetime records and are excluded from date-based totals
          until reviewed.{" "}
          <Link href="/jobs/profile/help" className="font-semibold underline">
            Ask the office for help
          </Link>
        </p>
      ) : null}
      <section
        aria-label="Current earnings summary"
        className="grid gap-3 min-[360px]:grid-cols-2"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm text-slate-700">
            Today · {earningsDateLabel(data.today)}
          </h2>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
            {money(data.today_cents)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm text-slate-700">This week</h2>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
            {money(data.week_cents)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {earningsDateLabel(data.week_start)} –{" "}
            {earningsDateLabel(data.today)}
          </p>
        </div>
      </section>
      {!historical ? (
        <section
          aria-labelledby="payment-progress"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2"
        >
          <h2
            id="payment-progress"
            className="pt-2 font-semibold text-slate-950"
          >
            Payment progress · {selected}
          </h2>
          <div className="divide-y divide-slate-100">
            <MoneyRow
              label={open ? "Awaiting month closure" : "Awaiting review"}
              cents={data.period.unbatched_cents}
              hint="Earned visits not yet in a payment batch"
            />
            <MoneyRow
              label="Payment being prepared"
              cents={data.period.preparing_cents}
              hint="Recorded batch amounts"
            />
            <MoneyRow
              label="Approved batches"
              cents={data.period.approved_cents}
              hint="Approval does not mean payment has been received"
            />
          </div>
        </section>
      ) : null}
      {!data.bank_details_ready ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Add bank details to receive payments</p>
          <Link
            href="/jobs/profile/payout"
            className={`mt-2 inline-flex min-h-11 items-center rounded-lg font-semibold underline ${FOCUS}`}
          >
            Update bank details →
          </Link>
        </div>
      ) : null}
      {data.period.payment_issue_count > 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950"
        >
          <p>
            A payment needs attention. Contact the office for help with the
            recorded payment issue.
          </p>
          <Link
            href="/jobs/profile/help"
            className={`mt-2 inline-flex min-h-11 items-center font-semibold underline ${FOCUS}`}
          >
            Get payment help
          </Link>
        </div>
      ) : null}
      <section aria-label="Earnings and payment records">
        <div
          role="group"
          aria-label="Choose records to view"
          className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"
        >
          {(["earnings", "payments"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={`min-h-11 rounded-xl px-2 text-sm font-semibold ${FOCUS} ${tab === value ? "bg-white text-blue-900 shadow-sm" : "text-slate-700"}`}
            >
              {value === "earnings" ? "Earning details" : "Payment statements"}
            </button>
          ))}
        </div>
        {tab === "earnings" ? (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-950">
                All earning details · {selected}
              </h2>
              <span className="text-sm text-slate-600">
                {data.earnings.length} visits
              </span>
            </div>
            <label
              htmlFor="earnings-search"
              className="mb-1 block text-sm text-slate-700"
            >
              Search jobs by service, date or reference
            </label>
            <input
              id="earnings-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setEarningPage(1);
              }}
              className={`mb-3 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm ${FOCUS}`}
            />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {filtered.length ? (
                <ul className="divide-y divide-slate-100">
                  {filtered
                    .slice(
                      (visiblePage - 1) * PAGE_SIZE,
                      visiblePage * PAGE_SIZE,
                    )
                    .map((row) => (
                      <li key={row.id}>
                        <Link
                          href={`/jobs/job/${encodeURIComponent(row.id)}`}
                          className={`block p-4 hover:bg-slate-50 ${FOCUS}`}
                          aria-label={`${row.reference}, ${row.service}, ${earningsDateLabel(row.date)}, ${money(row.amount_cents)}, view earning details`}
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <p className="font-semibold text-slate-900">
                              {row.service}
                            </p>
                            <p className="font-bold tabular-nums text-slate-950">
                              {money(row.amount_cents)}
                            </p>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {earningsDateLabel(row.date)} · {row.reference}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
                              {EARNING_STATE_LABEL[row.state]}
                            </span>
                            <span className="text-sm font-semibold text-blue-800">
                              View job details →
                            </span>
                          </div>
                          {row.bonus_cents > 0 ? (
                            <p className="mt-2 text-xs text-slate-700">
                              Includes {money(row.bonus_cents)} bonus
                            </p>
                          ) : null}
                        </Link>
                        <details className="border-t border-slate-100 px-4 pb-3">
                          <summary
                            className={`min-h-11 cursor-pointer py-3 text-sm font-semibold text-blue-800 ${FOCUS}`}
                          >
                            Earnings breakdown for {row.reference}
                          </summary>
                          {row.base_cents != null ? (
                            <MoneyRow
                              label="Base earnings"
                              cents={row.base_cents}
                            />
                          ) : (
                            <p className="text-xs text-slate-600">
                              Net recorded earnings. Ask the office if you need
                              further adjustment details.
                            </p>
                          )}
                          {row.bonus_cents > 0 ? (
                            <MoneyRow
                              label="Bonus included"
                              cents={row.bonus_cents}
                            />
                          ) : null}
                          {row.deduction_cents != null &&
                          row.deduction_cents > 0 ? (
                            <MoneyRow
                              label="Deductions"
                              cents={row.deduction_cents}
                            />
                          ) : null}
                          <MoneyRow
                            label="Total earned"
                            cents={row.amount_cents}
                          />
                        </details>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="p-6 text-center text-sm text-slate-700">
                  {query
                    ? "No jobs match your search."
                    : "No completed earning visits in this month."}
                </p>
              )}
            </div>
            <Pagination
              page={visiblePage}
              total={filtered.length}
              onPage={setEarningPage}
              label="Earning details"
            />
          </div>
        ) : (
          <div>
            <h2 className="font-semibold text-slate-950">
              Payments recorded in {selected}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Grouped by payment date in Johannesburg. These are settlement
              records, not individual jobs or a promise of a payment date.
            </p>
            <p className="my-4 text-2xl font-bold tabular-nums text-slate-950">
              {money(data.period.recorded_payments_cents)}
              <span className="ml-2 text-sm font-normal text-slate-600">
                {data.payments.length} recorded{" "}
                {data.payments.length === 1 ? "payment" : "payments"}
              </span>
            </p>
            {data.unassigned_payment_records > 0 ? (
              <p
                role="status"
                className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
              >
                {data.unassigned_payment_records} additional payment record(s)
                have no confirmed payment date and cannot be assigned to a
                month. They are excluded from monthly recorded totals until the
                office reviews them.
              </p>
            ) : null}
            {data.period.payment_review_count > 0 ? (
              <p
                role="status"
                className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
              >
                {data.period.payment_review_count} payment record(s) need
                review. Incomplete records are excluded from this recorded
                total; the total is unavailable if receipt records conflict.
                Contact the office for clarification.
              </p>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {data.payments.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.payments
                    .slice(
                      (visiblePaymentPage - 1) * PAGE_SIZE,
                      visiblePaymentPage * PAGE_SIZE,
                    )
                    .map((payment) => (
                      <li key={payment.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {earningsDateLabel(payment.paid_at, true)}
                          </h3>
                          <p className="font-bold tabular-nums text-slate-950">
                            {money(payment.amount_cents)}
                          </p>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">
                          {payment.method} · Payment recorded
                        </p>
                        {payment.earning_period ? (
                          <p className="mt-1 text-xs text-slate-600">
                            Earnings period:{" "}
                            {monthLabel(payment.earning_period)}
                          </p>
                        ) : null}
                        <p className="mt-2 break-all text-xs text-slate-600">
                          Reference: {payment.reference}
                        </p>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="p-6 text-center text-sm text-slate-700">
                  No payments recorded in this month. This is separate from your
                  earned amount.
                </p>
              )}
            </div>
            <Pagination
              page={visiblePaymentPage}
              total={data.payments.length}
              onPage={setPaymentPage}
              label="Payment statements"
            />
          </div>
        )}
      </section>
      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary
          className={`min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-900 ${FOCUS}`}
        >
          Lifetime and earlier earnings
        </summary>
        <MoneyRow
          label="Lifetime earned amount"
          cents={data.lifetime.earned_cents}
        />
        <p className="text-sm text-slate-700">
          {data.lifetime.completed_visits} completed cleaner visits across all
          recorded months.
        </p>
        <MoneyRow
          label="Earlier earnings awaiting historical review"
          cents={data.historical.unreviewed_cents}
          hint={`${data.historical.completed_visits} visits before October 2026`}
        />
        <p className="text-xs leading-relaxed text-slate-600">
          Use the month selector to view earlier earning records and recorded
          payments. Historical review balances are separate from current payment
          processing.
        </p>
      </details>
      <p role="status" aria-live="polite" className="text-xs text-slate-600">
        {refreshing
          ? "Refreshing earnings…"
          : `Updated ${updated} · Johannesburg time`}
      </p>
    </main>
  );
}

export function CleanerEarningsWorkspace() {
  const [data, setData] = useState<EarningsWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const month = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (selectedMonth: string | null) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) throw new Error("Please sign in to view your earnings.");
      const response = await cleanerAuthenticatedFetch(
        `/api/cleaner/earnings/workspace${selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : ""}`,
        { headers, signal: controller.signal, cache: "no-store" },
      );
      const raw: unknown = await response.json();
      if (controller.signal.aborted) return;
      const parsed = earningsWorkspaceSchema.safeParse(raw);
      if (
        !response.ok ||
        !parsed.success ||
        (selectedMonth && parsed.data.month !== selectedMonth)
      )
        throw new Error("Earnings could not be refreshed. Please try again.");
      setData(parsed.data);
      setError(null);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Earnings are temporarily unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(month.current);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(month.current);
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      request.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  if (!data)
    return (
      <main className="mx-auto max-w-2xl px-4 py-6" aria-busy={loading}>
        <h1 className="text-2xl font-bold text-slate-950">Earnings</h1>
        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-900"
          >
            <p>{error}</p>
            <button
              type="button"
              className={`${BUTTON} mt-3`}
              onClick={() => void load(month.current)}
            >
              Try again
            </button>
          </div>
        ) : (
          <div role="status" className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">Loading your earnings…</p>
            <div
              aria-hidden
              className="h-44 animate-pulse rounded-2xl bg-slate-200"
            />
          </div>
        )}
      </main>
    );
  return (
    <EarningsWorkspaceView
      data={data}
      refreshing={loading}
      error={error}
      onRefresh={() => void load(month.current)}
      onMonthChange={(value) => {
        month.current = value === data.today.slice(0, 7) ? null : value;
        void load(month.current);
      }}
    />
  );
}
