"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import {
  cleanerEarningsTierBadgeClass,
  cleanerTenureSummary,
  formatCleanerEarningsTierLabel,
  formatJoinedAtDisplay,
  formatJoinedAtForAdminInput,
  parseAdminJoinedAtInput,
} from "@/lib/admin/cleanerTenureDisplay";
import { updateCleanerProfile } from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";

type Props = {
  cleanerId: string;
  joined_at?: string | null;
  created_at?: string | null;
  onSaved?: () => void;
  compact?: boolean;
};

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-300 focus:outline-none";

export function OfficeCleanerEarningsTenurePanel({
  cleanerId,
  joined_at,
  created_at,
  onSaved,
  compact = false,
}: Props) {
  const summary = useMemo(
    () => cleanerTenureSummary({ joined_at, created_at }),
    [joined_at, created_at],
  );

  const [joinedInput, setJoinedInput] = useState(() => formatJoinedAtForAdminInput(summary.joinedAtIso));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setJoinedInput(formatJoinedAtForAdminInput(summary.joinedAtIso));
    setError(null);
    setSuccess(null);
  }, [summary.joinedAtIso, cleanerId]);

  async function handleSaveJoinedAt(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = parseAdminJoinedAtInput(joinedInput);
    if (!parsed) {
      setError("Enter a valid company join date (YYYY-MM-DD).");
      return;
    }

    setBusy(true);
    try {
      await updateCleanerProfile(cleanerId, { joined_at: parsed });
      setSuccess("Company join date saved. New standard jobs will use updated tenure.");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save join date.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-100 bg-white shadow-sm",
        compact ? "p-4" : "p-5",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <Wallet className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-800">Earnings &amp; tenure</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Standard cleans: {summary.payoutRateLabel} of job value, clamped R{summary.minZar}–R{summary.maxZar}.
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
            cleanerEarningsTierBadgeClass(summary.tier),
          )}
        >
          {formatCleanerEarningsTierLabel(summary.tier)}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Company join date</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">{formatJoinedAtDisplay(summary.joinedAtIso)}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tenure (today)</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">
            {summary.joinedAtIso ? `${summary.tenureMonths} mo` : "—"}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Standard rate</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">{summary.payoutRateLabel}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Per-job clamp</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">
            R{summary.minZar} – R{summary.maxZar}
          </dd>
        </div>
      </dl>

      {!compact ? (
        <details className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Earnings rules reference</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <strong>Junior</strong> (&lt;4 months with company): 60% of eligible visit total, min R250, max R300.
            </li>
            <li>
              <strong>Experienced</strong> (≥4 months): 70%, same R250–R300 clamp.
            </li>
            <li>Deep / move / carpet: fixed R250 solo; team R250 member / R270 lead (tenure ignored).</li>
            <li>Tenure is measured to each booking&apos;s appointment date when earnings are calculated.</li>
            <li>Already-completed jobs keep their stored rate — use Reset earnings on a booking to recalculate.</li>
          </ul>
        </details>
      ) : null}

      <form onSubmit={(e) => void handleSaveJoinedAt(e)} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Set company join date
          <input
            type="date"
            value={joinedInput}
            onChange={(e) => setJoinedInput(e.target.value)}
            className={fieldClass}
            required
          />
        </label>
        <p className="text-[11px] leading-snug text-slate-500">
          Controls 60% vs 70% on standard jobs. Does not change amounts already stored on completed bookings.
        </p>
        {error ? <p className="text-xs text-rose-700">{error}</p> : null}
        {success ? <p className="text-xs text-emerald-700">{success}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save join date
        </button>
      </form>
    </section>
  );
}
