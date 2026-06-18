"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Navigation, PlayCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { deriveCleanerJobPrimaryCta } from "@/lib/cleaner/deriveCleanerJobPrimaryCta";
import { optimisticPatchForLifecycleAction } from "@/lib/cleaner/cleanerLifecycleOptimisticPatch";
import { postCleanerLifecycleWithRetry } from "@/lib/cleaner/cleanerLifecyclePostWithRetry";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  isCleanerJobEarningPositive,
  JOB_EARNING_BLOCK_COMPLETION_MESSAGE,
  resolveCleanerJobEarning,
} from "@/lib/cleaner/cleanerJobEarning";
import { cleanerLifecycleFailureMessage } from "@/lib/cleaner/cleanerLifecycleClientErrors";

type CleanerJobPrimaryActionButtonProps = {
  bookingId: string;
  row: CleanerBookingRow;
  mapsQuery?: string | null;
  clockOffsetMs?: number;
  onRowPatched?: (bookingId: string, patch: Partial<CleanerBookingRow>) => void;
  onRefresh?: () => void | Promise<void>;
  className?: string;
  /** Compact styling for list cards */
  size?: "default" | "compact";
  /** Hero card uses filled amber styling */
  variant?: "outline" | "hero";
};

function iconForLabel(label: string): LucideIcon {
  const l = label.toLowerCase();
  if (l === "navigate" || l === "on my way") return Navigation;
  if (l === "accept job") return CheckCircle2;
  if (l === "in progress") return PlayCircle;
  if (l === "complete job" || l === "yes, complete") return CheckCircle2;
  return CheckCircle2;
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
  const guardRef = useRef(false);

  const effectiveRow = localRow ?? row;
  const nowMs = Date.now() + clockOffsetMs;

  const cta = useMemo(
    () =>
      deriveCleanerJobPrimaryCta({
        row: effectiveRow,
        nowMs,
        mapsQuery,
      }),
    [effectiveRow, nowMs, mapsQuery],
  );

  const jobEarningPositive = isCleanerJobEarningPositive(resolveCleanerJobEarning(effectiveRow));

  const runLifecycle = useCallback(
    async (action: "accept" | "en_route" | "start" | "complete", mapsHref?: string) => {
      if (guardRef.current) return;
      guardRef.current = true;
      setBusy(true);
      setError(null);

      if (mapsHref) {
        window.open(mapsHref, "_blank", "noopener,noreferrer");
      }

      const idempotencyKey = crypto.randomUUID();
      try {
        const result = await postCleanerLifecycleWithRetry({
          bookingId,
          action,
          idempotencyKey,
          getHeaders: getCleanerAuthHeaders,
        });

        if (!result.ok) {
          setError(
            cleanerLifecycleFailureMessage({
              action,
              code: result.code,
              baseMessage: result.error ?? "Could not update job.",
              httpStatus: result.status,
            }),
          );
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
    },
    [bookingId, effectiveRow, onRefresh, onRowPatched],
  );

  const handleClick = useCallback(() => {
    if (cta.kind === "maps") {
      window.open(cta.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (cta.kind !== "lifecycle") return;

    if (cta.action === "complete") {
      if (!jobEarningPositive) return;
      if (cta.requiresConfirm && !confirmComplete) {
        setConfirmComplete(true);
        return;
      }
    }

    void runLifecycle(cta.action, cta.mapsHref);
  }, [cta, confirmComplete, jobEarningPositive, runLifecycle]);

  if (cta.kind === "hidden") return null;

  const label = cta.kind === "lifecycle" && confirmComplete ? "Yes, complete" : cta.label;
  const Icon = iconForLabel(cta.label);
  const isCompact = size === "compact";
  const isHero = variant === "hero";

  const buttonClass = cn(
    "flex w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-60",
    isCompact ? "h-8 text-xs" : "h-9",
    isHero
      ? "border-transparent bg-amber-600 text-white hover:bg-amber-600/90"
      : "border-gray-200 bg-white text-slate-700 hover:bg-gray-50",
    className,
  );

  const completeBlocked =
    cta.kind === "lifecycle" && cta.action === "complete" && !jobEarningPositive;

  return (
    <div className="min-w-0 flex-1 space-y-1">
      {confirmComplete && cta.kind === "lifecycle" && cta.action === "complete" ? (
        <div className="mb-1 flex gap-2">
          <button
            type="button"
            className={cn(buttonClass, "flex-1")}
            disabled={busy || completeBlocked}
            onClick={() => void runLifecycle("complete")}
          >
            {busy ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : null}
            Yes, complete
          </button>
          <button
            type="button"
            className={cn(
              buttonClass,
              "flex-1 border-gray-200 text-slate-500",
            )}
            disabled={busy}
            onClick={() => setConfirmComplete(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={buttonClass}
          disabled={busy || completeBlocked}
          onClick={handleClick}
        >
          {busy ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Icon
              className={cn(
                "shrink-0",
                isCompact ? "size-3" : "size-3.5",
                isHero ? "text-white" : "text-blue-500",
              )}
              aria-hidden
            />
          )}
          {busy && cta.kind === "lifecycle" && cta.action === "en_route" ? "On my way…" : label}
        </button>
      )}
      {completeBlocked ? (
        <p className="text-[11px] leading-snug text-amber-700">{JOB_EARNING_BLOCK_COMPLETION_MESSAGE}</p>
      ) : null}
      {error ? (
        <p className="text-[11px] leading-snug text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
