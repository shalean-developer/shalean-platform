"use client";

import { Fragment } from "react";
import { AdminAssignForm, type CleanerOption } from "@/components/admin/AdminAssignForm";

export type SlaBreachRow = {
  id: string;
  customer_name: string | null;
  location: string | null;
  date: string | null;
  time: string | null;
  became_pending_at: string | null;
  created_at: string;
  cleaner_id: string | null;
  dispatch_status: string | null;
  status: string | null;
  slaBreachMinutes: number;
  dispatchLastAction?: string | null;
  lastActionMinutesAgo?: number | null;
  duration_minutes?: number | null;
};

function formatScheduled(date: string | null, time: string | null): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "";
  return t ? `${label} · ${t}` : label;
}

function dispatchShort(ds: string | null): string {
  const s = String(ds ?? "").toLowerCase();
  if (s === "searching") return "Searching";
  if (s === "offered") return "Offered";
  if (s === "unassignable") return "Unassignable";
  if (s === "assigned") return "Assigned";
  if (s === "failed") return "Failed";
  if (s === "no_cleaner") return "No cleaner";
  return s ? s : "—";
}

function priorityBadge(mins: number): { label: string; className: string } {
  if (mins > 30) return { label: "🔴 Critical >30m", className: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-100" };
  if (mins > 10) return { label: "🟠 High >10m", className: "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100" };
  return { label: "🟡 SLA breach", className: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" };
}

function rowTintClass(mins: number): string {
  if (mins > 30) return "bg-red-50/90 dark:bg-red-950/25";
  if (mins > 10) return "bg-orange-50/90 dark:bg-orange-950/20";
  return "bg-amber-50/50 dark:bg-amber-950/10";
}

function isStuck(r: SlaBreachRow): boolean {
  return r.slaBreachMinutes > 20 && (r.lastActionMinutesAgo ?? 999) > 10;
}

function retryDisabled(
  r: SlaBreachRow,
  retryingId: string | null,
  cooldownUntilById: Record<string, number>,
): boolean {
  if (retryingId === r.id) return true;
  const until = cooldownUntilById[r.id];
  if (until != null && Date.now() < until) return true;
  if (r.lastActionMinutesAgo != null && r.lastActionMinutesAgo < 1) return true;
  return false;
}

function escalateDisabled(
  r: SlaBreachRow,
  escalatingId: string | null,
  escalateCooldownUntilById: Record<string, number>,
): boolean {
  if (escalatingId === r.id) return true;
  const u = escalateCooldownUntilById[r.id];
  return u != null && Date.now() < u;
}

type RowActionsProps = {
  r: SlaBreachRow;
  onToggleAssign: (id: string) => void;
  onRetryDispatch: (id: string) => void;
  onViewDetails: (id: string) => void;
  onEscalate: (r: SlaBreachRow) => void;
  retryingId: string | null;
  escalatingId: string | null;
  cooldownUntilById: Record<string, number>;
  escalateCooldownUntilById: Record<string, number>;
};

function RowActions({
  r,
  onToggleAssign,
  onRetryDispatch,
  onViewDetails,
  onEscalate,
  retryingId,
  escalatingId,
  cooldownUntilById,
  escalateCooldownUntilById,
}: RowActionsProps) {
  const rDisabled = retryDisabled(r, retryingId, cooldownUntilById);
  const eDisabled = escalateDisabled(r, escalatingId, escalateCooldownUntilById);
  const showEscalate = r.slaBreachMinutes > 60;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        type="button"
        onClick={() => onToggleAssign(r.id)}
        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
      >
        Assign
      </button>
      <button
        type="button"
        disabled={rDisabled}
        onClick={() => onRetryDispatch(r.id)}
        title={r.lastActionMinutesAgo != null && r.lastActionMinutesAgo < 1 ? "Wait for last action to age" : undefined}
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {retryingId === r.id ? "Retry…" : "Retry dispatch"}
      </button>
      {showEscalate ? (
        <button
          type="button"
          disabled={eDisabled}
          onClick={() => onEscalate(r)}
          title={eDisabled && escalatingId !== r.id ? "Escalation recently sent for this booking" : undefined}
          className="rounded-md border border-rose-400 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/70"
        >
          {escalatingId === r.id ? "Escalate…" : "Escalate"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onViewDetails(r.id)}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Details
      </button>
    </div>
  );
}

/** Sticky summary of the worst breach — stays visible while scrolling the queue. */
export function SlaWorstBreachPinned({
  row: r,
  assignBookingId,
  onToggleAssign,
  onAssignSuccess,
  onAssignError,
  onAssignCascadeExhausted,
  onViewDetails,
  onRetryDispatch,
  onEscalate,
  cleaners,
  retryingId,
  escalatingId,
  cooldownUntilById,
  escalateCooldownUntilById,
}: {
  row: SlaBreachRow;
  cleaners: CleanerOption[];
  assignBookingId: string | null;
  onToggleAssign: (id: string) => void;
  onAssignSuccess: (id: string) => void;
  onAssignError: (message: string) => void;
  onAssignCascadeExhausted?: (row: SlaBreachRow) => void;
  onViewDetails: (id: string) => void;
  onRetryDispatch: (id: string) => void;
  onEscalate: (r: SlaBreachRow) => void;
  retryingId: string | null;
  escalatingId: string | null;
  cooldownUntilById: Record<string, number>;
  escalateCooldownUntilById: Record<string, number>;
}) {
  const badge = priorityBadge(r.slaBreachMinutes);
  const tint = rowTintClass(r.slaBreachMinutes);
  const stuck = isStuck(r);
  return (
    <div
      className={`sticky top-14 z-20 mb-3 rounded-xl border-2 border-red-300/80 shadow-md dark:border-red-900/60 ${tint}`}
    >
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-800 dark:text-red-200">🔴 Worst breach</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
            {stuck ? (
              <span className="inline-flex rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-950 dark:bg-amber-900/60 dark:text-amber-100">
                ⚠️ Stuck
              </span>
            ) : null}
            <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{r.slaBreachMinutes}m overdue</span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{r.customer_name?.trim() || "—"}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">{r.dispatchLastAction?.trim() || "—"}</p>
        </div>
        <div className="shrink-0">
          <RowActions
            r={r}
            onToggleAssign={onToggleAssign}
            onRetryDispatch={onRetryDispatch}
            onViewDetails={onViewDetails}
            onEscalate={onEscalate}
            retryingId={retryingId}
            escalatingId={escalatingId}
            cooldownUntilById={cooldownUntilById}
            escalateCooldownUntilById={escalateCooldownUntilById}
          />
        </div>
      </div>
      {assignBookingId === r.id ? (
        <div className={`border-t border-zinc-200 px-3 py-3 dark:border-zinc-700 ${tint}`}>
          <div className="max-w-md rounded-lg border border-zinc-200 bg-white/95 p-3 dark:border-zinc-700 dark:bg-zinc-950/90">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Assign cleaner</p>
            <AdminAssignForm
              booking={{ id: r.id, date: r.date, time: r.time, duration_minutes: r.duration_minutes ?? null }}
              bookingId={r.id}
              cleaners={cleaners}
              slaBreachMinutes={r.slaBreachMinutes}
              onCascadeExhausted={() => onAssignCascadeExhausted?.(r)}
              onDone={() => onAssignSuccess(r.id)}
              onError={(msg) => onAssignError(msg)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SlaBreachQueueTable({
  rows,
  cleaners,
  assignBookingId,
  onToggleAssign,
  onAssignSuccess,
  onAssignError,
  onAssignCascadeExhausted,
  onViewDetails,
  onRetryDispatch,
  onEscalate,
  retryingId,
  escalatingId,
  cooldownUntilById,
  escalateCooldownUntilById,
}: {
  rows: SlaBreachRow[];
  cleaners: CleanerOption[];
  assignBookingId: string | null;
  onToggleAssign: (id: string) => void;
  onAssignSuccess: (id: string) => void;
  onAssignError: (message: string) => void;
  onAssignCascadeExhausted?: (row: SlaBreachRow) => void;
  onViewDetails: (id: string) => void;
  onRetryDispatch: (id: string) => void;
  onEscalate: (r: SlaBreachRow) => void;
  retryingId: string | null;
  escalatingId: string | null;
  cooldownUntilById: Record<string, number>;
  escalateCooldownUntilById: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <table className="min-w-[960px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
            <th className="px-3 py-3">Priority</th>
            <th className="px-3 py-3">Overdue</th>
            <th className="px-3 py-3">Booking time</th>
            <th className="px-3 py-3">Customer &amp; address</th>
            <th className="px-3 py-3">Dispatch</th>
            <th className="px-3 py-3">Last action</th>
            <th className="px-3 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No additional rows — worst breach is pinned above.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
            const badge = priorityBadge(r.slaBreachMinutes);
            const tint = rowTintClass(r.slaBreachMinutes);
            const stuck = isStuck(r);
            return (
              <Fragment key={r.id}>
                <tr className={`border-b border-zinc-100 dark:border-zinc-800/80 ${tint}`}>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                      {stuck ? (
                        <span className="inline-flex w-fit rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-950 dark:bg-amber-900/60 dark:text-amber-100">
                          ⚠️ Stuck
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {r.slaBreachMinutes}
                    </span>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400"> min</span>
                  </td>
                  <td className="px-3 py-2 align-top text-zinc-800 dark:text-zinc-200">{formatScheduled(r.date, r.time)}</td>
                  <td className="max-w-[280px] px-3 py-2 align-top">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">{r.customer_name?.trim() || "—"}</p>
                    <p className="mt-0.5 text-xs leading-snug text-zinc-600 dark:text-zinc-400">{r.location?.trim() || "—"}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300">{dispatchShort(r.dispatch_status)}</td>
                  <td className="max-w-[240px] px-3 py-2 align-top text-xs text-zinc-600 dark:text-zinc-400">
                    {r.dispatchLastAction?.trim() || "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <RowActions
                      r={r}
                      onToggleAssign={onToggleAssign}
                      onRetryDispatch={onRetryDispatch}
                      onViewDetails={onViewDetails}
                      onEscalate={onEscalate}
                      retryingId={retryingId}
                      escalatingId={escalatingId}
                      cooldownUntilById={cooldownUntilById}
                      escalateCooldownUntilById={escalateCooldownUntilById}
                    />
                  </td>
                </tr>
                {assignBookingId === r.id ? (
                  <tr className={`border-b border-zinc-100 dark:border-zinc-800/80 ${tint}`}>
                    <td colSpan={7} className="px-3 py-3">
                      <div className="max-w-md rounded-lg border border-zinc-200 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Assign cleaner</p>
                        <AdminAssignForm
                          booking={{ id: r.id, date: r.date, time: r.time, duration_minutes: r.duration_minutes ?? null }}
                          bookingId={r.id}
                          cleaners={cleaners}
                          slaBreachMinutes={r.slaBreachMinutes}
                          onCascadeExhausted={() => onAssignCascadeExhausted?.(r)}
                          onDone={() => onAssignSuccess(r.id)}
                          onError={(msg) => onAssignError(msg)}
                        />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
