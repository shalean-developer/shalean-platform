"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Navigation, PlayCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { deriveCleanerJobPrimaryCta } from "@/lib/cleaner/deriveCleanerJobPrimaryCta";
import { optimisticPatchForLifecycleAction } from "@/lib/cleaner/cleanerLifecycleOptimisticPatch";
import { postCleanerLifecycleWithRetry } from "@/lib/cleaner/cleanerLifecyclePostWithRetry";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { isCleanerJobEarningPositive, JOB_EARNING_BLOCK_COMPLETION_MESSAGE, resolveCleanerJobEarning } from "@/lib/cleaner/cleanerJobEarning";
import { cleanerLifecycleFailureMessage } from "@/lib/cleaner/cleanerLifecycleClientErrors";

type CleanerJobPrimaryActionButtonProps = {
  bookingId: string;
  row: CleanerBookingRow;
  mapsQuery?: string | null;
  clockOffsetMs?: number;
  onRowPatched?: (bookingId: string, patch: Partial<CleanerBookingRow>) => void;
  onRefresh?: () => void | Promise<void>;
  className?: string;
  size?: "default" | "compact";
  variant?: "outline" | "hero";
};

const CLEANER_COMPLETION_MIN_ELAPSED_RATIO = 0.9;

type EarlyFinishReason = "work_completed_faster" | "customer_requested_early_finish" | "property_required_less_work" | "other";

function iconForLabel(label: string): LucideIcon {
  const l = label.toLowerCase();
  if (l === "navigate" || l === "on my way") return Navigation;
  if (l === "accept job") return CheckCircle2;
  if (l === "in progress") return PlayCircle;
  return CheckCircle2;
}

function resolveDurationMinutes(row: CleanerBookingRow): number | null {
  const candidates = [row.duration_minutes, row.estimated_duration_minutes];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const hours = Number(row.duration_hours);
  if (Number.isFinite(hours) && hours > 0) return hours * 60;
  return null;
}

function completionRemainingMinutes(row: CleanerBookingRow, nowMs: number): number | null {
  const durationMinutes = resolveDurationMinutes(row);
  const startedAtMs = typeof row.started_at === "string" ? Date.parse(row.started_at) : Number.NaN;
  if (durationMinutes == null || !Number.isFinite(startedAtMs)) return null;
  const requiredMinutes = durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO;
  const elapsedMinutes = Math.max(0, (nowMs - startedAtMs) / 60_000);
  return Math.max(0, Math.ceil(requiredMinutes - elapsedMinutes));
}

function formatRemaining(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function CleanerJobPrimaryActionButton({
  bookingId,
  row,
  mapsQuery,
  clockOffsetMs = 0,
  onRowPatched,
  onRefresh,
  className,
  size = "default",
  variant = "outline",
}: CleanerJobPrimaryActionButtonProps) {
  const [localRow, setLocalRow] = useState<CleanerBookingRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now() + clockOffsetMs);
  const [showEarlyFinish, setShowEarlyFinish] = useState(false);
  const [earlyFinishReason, setEarlyFinishReason] = useState<EarlyFinishReason>("work_completed_faster");
  const [earlyFinishSent, setEarlyFinishSent] = useState(false);
  const guardRef = useRef(false);

  useEffect(() => {
    const tick = () => setClockNowMs(Date.now() + clockOffsetMs);
    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [clockOffsetMs]);

  const effectiveRow = localRow ?? row;
  const nowMs = clockNowMs;
  const cta = useMemo(() => deriveCleanerJobPrimaryCta({ row: effectiveRow, nowMs, mapsQuery }), [effectiveRow, nowMs, mapsQuery]);
  const jobEarningPositive = isCleanerJobEarningPositive(resolveCleanerJobEarning(effectiveRow));
  const remainingMinutes = cta.kind === "lifecycle" && cta.action === "complete" ? completionRemainingMinutes(effectiveRow, nowMs) : null;
  const completionTimingBlocked = remainingMinutes != null && remainingMinutes > 0;

  const runLifecycle = useCallback(async (action: "accept" | "en_route" | "start" | "complete", mapsHref?: string) => {
    if (guardRef.current) return;
    guardRef.current = true;
    setBusy(true);
    setError(null);
    if (mapsHref) window.open(mapsHref, "_blank", "noopener,noreferrer");
    try {
      const result = await postCleanerLifecycleWithRetry({ bookingId, action, idempotencyKey: crypto.randomUUID(), getHeaders: getCleanerAuthHeaders });
      if (!result.ok) {
        setError(cleanerLifecycleFailureMessage({ action, code: result.code, baseMessage: result.error ?? "Could not update job.", httpStatus: result.status }));
        return;
      }
      const patch = optimisticPatchForLifecycleAction(action, effectiveRow) as Partial<CleanerBookingRow>;
      setLocalRow({ ...effectiveRow, ...patch });
      onRowPatched?.(bookingId, patch);
      setConfirmComplete(false);
      await onRefresh?.();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
      guardRef.current = false;
    }
  }, [bookingId, effectiveRow, onRefresh, onRowPatched]);

  const requestEarlyFinish = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await getCleanerAuthHeaders();
      const res = await fetch(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}/early-finish`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ reason: earlyFinishReason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not request early completion.");
      setEarlyFinishSent(true);
      setShowEarlyFinish(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request early completion.");
    } finally {
      setBusy(false);
    }
  }, [bookingId, busy, earlyFinishReason]);

  const handleClick = useCallback(() => {
    if (cta.kind === "maps") return void window.open(cta.href, "_blank", "noopener,noreferrer");
    if (cta.kind !== "lifecycle") return;
    if (cta.action === "complete") {
      if (!jobEarningPositive || completionTimingBlocked) return;
      if (cta.requiresConfirm && !confirmComplete) return setConfirmComplete(true);
    }
    void runLifecycle(cta.action, cta.mapsHref);
  }, [cta, completionTimingBlocked, confirmComplete, jobEarningPositive, runLifecycle]);

  if (cta.kind === "hidden") return null;
  const label = cta.kind === "lifecycle" && confirmComplete ? "Yes, complete" : cta.label;
  const Icon = iconForLabel(cta.label);
  const isCompact = size === "compact";
  const isHero = variant === "hero";
  const buttonClass = cn(
    "flex w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-60",
    isCompact ? "h-8 text-xs" : "h-9",
    isHero ? "border-transparent bg-amber-600 text-white hover:bg-amber-600/90" : "border-gray-200 bg-white text-slate-700 hover:bg-gray-50",
    className,
  );
  const completeBlocked = cta.kind === "lifecycle" && cta.action === "complete" && (!jobEarningPositive || completionTimingBlocked);

  return (
    <div className="min-w-0 flex-1 space-y-1">
      {confirmComplete && cta.kind === "lifecycle" && cta.action === "complete" ? (
        <div className="mb-1 flex gap-2">
          <button type="button" className={cn(buttonClass, "flex-1")} disabled={busy || completeBlocked} onClick={() => void runLifecycle("complete")}>{busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}Yes, complete</button>
          <button type="button" className={cn(buttonClass, "flex-1 border-gray-200 text-slate-500")} disabled={busy} onClick={() => setConfirmComplete(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className={buttonClass} disabled={busy || completeBlocked} onClick={handleClick}>
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Icon className={cn("shrink-0", isCompact ? "size-3" : "size-3.5", isHero ? "text-white" : "text-blue-500")} aria-hidden />}
          {busy && cta.kind === "lifecycle" && cta.action === "en_route" ? "On my way…" : label}
        </button>
      )}

      {completionTimingBlocked && remainingMinutes != null ? (
        <div className="space-y-2">
          <p className="text-xs leading-snug text-sky-700">Complete available in {formatRemaining(remainingMinutes)}.</p>
          {earlyFinishSent ? (
            <p className="text-xs font-medium text-green-700">Customer approval requested. Once they confirm, refresh and complete the job.</p>
          ) : showEarlyFinish ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <label className="text-xs font-medium text-slate-700">Why did the job finish early?</label>
              <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs" value={earlyFinishReason} onChange={(e) => setEarlyFinishReason(e.target.value as EarlyFinishReason)}>
                <option value="work_completed_faster">Work completed faster than expected</option>
                <option value="customer_requested_early_finish">Customer asked us to finish early</option>
                <option value="property_required_less_work">Property required less work than expected</option>
                <option value="other">Other</option>
              </select>
              <div className="mt-2 flex gap-2">
                <button type="button" className="h-8 flex-1 rounded-md bg-blue-600 px-2 text-xs font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void requestEarlyFinish()}>Request customer approval</button>
                <button type="button" className="h-8 rounded-md border border-slate-300 px-2 text-xs" disabled={busy} onClick={() => setShowEarlyFinish(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-left text-xs font-semibold text-blue-700 underline" onClick={() => setShowEarlyFinish(true)}>Finished early? Ask the customer to approve completion</button>
          )}
        </div>
      ) : null}

      {!completionTimingBlocked && cta.kind === "lifecycle" && cta.action === "complete" && !jobEarningPositive ? <p className="text-xs leading-snug text-amber-700">{JOB_EARNING_BLOCK_COMPLETION_MESSAGE}</p> : null}
      {error ? <p className="text-xs leading-snug text-red-600" role="alert">{error}</p> : null}
    </div>
  );
}
