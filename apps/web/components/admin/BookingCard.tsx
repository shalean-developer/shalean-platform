"use client";

import type { AdminBookingsListRow } from "@/lib/admin/adminBookingsListRow";
import {
  centsToZar,
  cleanerDisplayName,
  cleanerSelectEmptyLabel,
  dispatchStateLabel,
  formatStartsIn,
  formatTimeShort,
  formatWhen,
  rowHighlightClass,
  rosterTooltipNames,
  startsInClass,
  startsInMinutes,
  zar,
} from "@/lib/admin/adminBookingsListDerived";
import {
  adminBookingInvoiceHint,
  adminBookingPaymentPrimaryLabel,
} from "@/lib/admin/adminBookingListPaymentDisplay";
import { assignmentSourceLabel } from "@/lib/admin/assignmentDisplay";
import { metricAttemptBucket } from "@/lib/dispatch/dispatchMetricContext";
import BookingActionsDropdown from "@/components/admin/BookingActionsDropdown";
import type { CleanerOption } from "@/lib/admin/assignRanking";
import { AvatarStack } from "@/components/admin/AvatarStack";
import { BookingCardStatusBadge } from "@/components/admin/BookingCardStatusBadge";

export type AdminBookingCardProps = {
  row: AdminBookingsListRow;
  today: string;
  sortedCleaners: CleanerOption[];
  retryDispatchBookingId: string | null;
  onOpenDetails: (id: string) => void;
  onPatchStatus: (id: string, nextStatus: string) => void;
  onPatchCleaner: (id: string, cleanerId: string | null) => void;
  onToggleAssign: (id: string) => void;
  onRetryDispatch: (id: string) => void | Promise<void>;
  onBookingActionsReschedule: () => void;
  onBookingActionsCancel: () => void;
};

function teamHeadline(row: AdminBookingsListRow): string {
  const roster = row.booking_cleaners ?? [];
  if (!roster.length) return "Unassigned";
  if (row.team_id?.trim()) return row.team?.name?.trim() || "Team";
  return "Custom team";
}

export function BookingCard({
  row: r,
  today,
  sortedCleaners,
  retryDispatchBookingId,
  onOpenDetails,
  onPatchStatus,
  onPatchCleaner,
  onToggleAssign,
  onRetryDispatch,
  onBookingActionsReschedule,
  onBookingActionsCancel,
}: AdminBookingCardProps) {
  const roster = r.booking_cleaners ?? [];
  const lead = roster.find((c) => String(c.role).toLowerCase() === "lead");
  const leadName = lead?.full_name?.trim() || null;
  const startMins = startsInMinutes(r.date, r.time);
  const assignSourceLine = assignmentSourceLabel(r);
  const cleanerPayoutZar = centsToZar(r.cleaner_payout_cents);
  const cleanerBonusZar = centsToZar(r.cleaner_bonus_cents) ?? 0;
  const cleanerTotalZar = cleanerPayoutZar == null ? null : cleanerPayoutZar + cleanerBonusZar;
  const companyRevenueZar = centsToZar(r.company_revenue_cents);
  const locationLabel = r.location?.trim() || "Location TBC";
  const rosterTip = rosterTooltipNames(roster);
  const missingLead = roster.length > 0 && !lead;
  const shortTeam = Boolean(r.is_team_job) && roster.length >= 1 && roster.length < 2;

  const statusSelectValue = (() => {
    const st = (r.status ?? "pending").toLowerCase();
    if (st === "assigned") return "confirmed";
    const allowed = new Set(["pending", "in_progress", "completed", "cancelled", "failed"]);
    return allowed.has(st) ? st : "pending";
  })();

  return (
    <article
      className={[
        "flex flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900",
        rowHighlightClass(r, today),
      ].join(" ")}
    >
      <div
        className="cursor-pointer p-4 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        role="link"
        tabIndex={0}
        aria-label={`Open booking ${r.id}`}
        onClick={() => onOpenDetails(r.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetails(r.id);
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
              {r.service ?? "Cleaning"}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="tabular-nums">{formatTimeShort(r.date, r.time)}</span>
              <span className="mx-1 text-zinc-300 dark:text-zinc-600">·</span>
              <span className="line-clamp-2">{locationLabel}</span>
            </p>
          </div>
          <BookingCardStatusBadge status={r.status} />
        </div>

        <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-100" title={rosterTip || undefined}>
          {teamHeadline(r)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AvatarStack cleaners={roster} />
          {roster.length > 0 ? (
            <span className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
              👥 {roster.length} cleaner{roster.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {leadName ? (
            <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">Lead: {leadName}</span>
          ) : null}
        </div>

        {(missingLead || shortTeam || typeof r.duration_minutes === "number") ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {typeof r.duration_minutes === "number" && r.duration_minutes > 0 ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {r.duration_minutes} min
              </span>
            ) : null}
            {missingLead ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                No lead
              </span>
            ) : null}
            {shortTeam ? (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-900 dark:bg-orange-950/45 dark:text-orange-100">
                Short team
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {r.customer_name?.trim() || "—"}
            {r.is_test ? (
              <span className="ml-2 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                Test
              </span>
            ) : null}
            {r.admin_force_slot_override ? (
              <span
                className="ml-2 inline-flex rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
                title="Created with duplicate-slot force override — review if unsure."
              >
                Force slot
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{r.customer_email ?? ""}</p>
          {r.customer_billing_type || r.customer_schedule_type ? (
            <p className="mt-0.5 truncate text-[10px] text-zinc-400 dark:text-zinc-500">
              Billing:{" "}
              {r.customer_billing_type === "monthly"
                ? "Monthly"
                : r.customer_billing_type === "per_booking"
                  ? "Per booking"
                  : (r.customer_billing_type ?? "—")}
              {" · "}
              Schedule:{" "}
              {r.customer_schedule_type === "fixed_schedule"
                ? "Fixed"
                : r.customer_schedule_type === "on_demand"
                  ? "On-demand"
                  : (r.customer_schedule_type ?? "—")}
            </p>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">When</p>
            <p className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">{formatWhen(r.date, r.time)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Starts in</p>
            <p className={["mt-0.5 tabular-nums font-medium", startsInClass(startMins)].join(" ")}>
              {formatStartsIn(startMins)}
            </p>
          </div>
        </div>

        <div className="mt-3 text-xs">
          <p className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            Customer R {zar(r).toLocaleString("en-ZA")}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Cleaner{" "}
            {cleanerTotalZar == null ? (
              <span className="font-medium text-amber-700 dark:text-amber-300">Pending payout</span>
            ) : (
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                R {cleanerTotalZar.toLocaleString("en-ZA")}
              </span>
            )}
          </p>
          {cleanerPayoutZar != null ? (
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
              Payout R {cleanerPayoutZar.toLocaleString("en-ZA")}
              {cleanerBonusZar > 0 ? ` + bonus R ${cleanerBonusZar.toLocaleString("en-ZA")}` : ""}
              {companyRevenueZar != null ? ` · co. R ${companyRevenueZar.toLocaleString("en-ZA")}` : ""}
            </p>
          ) : null}
          <p className="mt-1 font-medium text-zinc-800 dark:text-zinc-200">{adminBookingPaymentPrimaryLabel(r)}</p>
          {adminBookingInvoiceHint(r.monthly_invoice_id) ? (
            <p className="mt-0.5 text-[11px] text-sky-700 dark:text-sky-300">
              {adminBookingInvoiceHint(r.monthly_invoice_id)}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="border-t border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <label className="sr-only" htmlFor={`status-${r.id}`}>
                Booking status
              </label>
              <select
                id={`status-${r.id}`}
                value={statusSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  void onPatchStatus(r.id, v);
                }}
                className="w-full max-w-[200px] rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-950"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="failed">Failed</option>
              </select>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {dispatchStateLabel(r.dispatch_status, r.status)}
                {typeof r.surge_multiplier === "number" && r.surge_multiplier > 1 ? (
                  <span className="ml-1 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                    Surge x{r.surge_multiplier.toFixed(1)}
                  </span>
                ) : null}
              </p>
              {assignSourceLine ? (
                <p className="mt-0.5 text-[10px] font-semibold leading-snug text-emerald-800 dark:text-emerald-300/90">
                  {assignSourceLine}
                </p>
              ) : null}
            </div>

            {(r.status ?? "").toLowerCase() === "pending" &&
            !r.cleaner_id &&
            ["failed", "unassignable", "no_cleaner"].includes((r.dispatch_status ?? "").toLowerCase()) ? (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dispatch needs attention">
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
                  Needs attention
                </span>
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[10px] font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => onToggleAssign(r.id)}
                >
                  Manually assign
                </button>
                <button
                  type="button"
                  disabled={retryDispatchBookingId === r.id}
                  className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  onClick={() => void onRetryDispatch(r.id)}
                >
                  {retryDispatchBookingId === r.id ? "Retrying…" : "Retry now"}
                </button>
                <p className="w-full text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Attempts:</span>{" "}
                  {metricAttemptBucket(Number(r.dispatch_attempt_count ?? 0) || 0)}
                  <span className="mx-1 text-zinc-400">·</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Fallback:</span>{" "}
                  <span className="break-words" title={r.fallback_reason ?? undefined}>
                    {r.fallback_reason?.trim() || "—"}
                  </span>
                </p>
              </div>
            ) : null}

            {r.attempted_cleaner_id?.trim() && r.attempted_cleaner_id.trim() !== (r.cleaner_id ?? "").trim() ? (
              <p className="text-[10px] leading-snug text-zinc-600 dark:text-zinc-400" title={r.attempted_cleaner_id}>
                Selected at checkout:{" "}
                {cleanerDisplayName(r.attempted_cleaner_id.trim(), sortedCleaners) ??
                  `ID ${r.attempted_cleaner_id.slice(0, 8)}…`}
              </p>
            ) : null}

            <div>
              <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                Solo cleaner (legacy field)
              </label>
              <select
                value={r.cleaner_id ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  void onPatchCleaner(r.id, v ? v : null);
                }}
                className="w-full max-w-[220px] rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
              >
                <option value="">{cleanerSelectEmptyLabel(r)}</option>
                {sortedCleaners.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <BookingActionsDropdown
            booking={r}
            onAssign={(booking) => onToggleAssign(booking.id)}
            onReschedule={onBookingActionsReschedule}
            onCancel={onBookingActionsCancel}
            onView={(booking) => onOpenDetails(booking.id)}
          />
        </div>
      </div>
    </article>
  );
}
