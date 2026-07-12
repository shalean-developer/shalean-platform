"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import {
  assignTeamToBookingAdmin,
  fetchTeamAssignCandidates,
  type AdminTeamAssignCandidate,
} from "@/lib/admin/dashboard";
import { emitAdminToast } from "@/lib/admin/toastBus";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  bookingId: string | null;
  bookingLabel?: string | null;
  currentTeamId?: string | null;
  onOpenChange: (open: boolean) => void;
  onAssigned?: () => void | Promise<void>;
};

export function OfficeAssignTeamDialog({
  open,
  bookingId,
  bookingLabel,
  currentTeamId,
  onOpenChange,
  onAssigned,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualifiedLabel, setQualifiedLabel] = useState("");
  const [teams, setTeams] = useState<AdminTeamAssignCandidate[]>([]);
  const [pickId, setPickId] = useState<string | null>(null);
  const [earningsFinalized, setEarningsFinalized] = useState(false);
  const [forceAssign, setForceAssign] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeamAssignCandidates(bookingId);
      if (!data.supports_team_assignment) {
        setTeams([]);
        setEarningsFinalized(false);
        setError("This booking is not eligible for team assignment (deep / move only).");
        return;
      }
      setQualifiedLabel(data.qualified_for_label);
      setTeams(data.teams);
      setEarningsFinalized(data.earnings_finalized);
      if (data.earnings_finalized) setForceAssign(false);
      const current = currentTeamId && data.teams.some((t) => t.id === currentTeamId) ? currentTeamId : null;
      const firstAssignable = data.teams.find((t) => t.assignable)?.id ?? null;
      setPickId(current ?? firstAssignable);
    } catch (e) {
      setTeams([]);
      setEarningsFinalized(false);
      setError(e instanceof Error ? e.message : "Could not load teams.");
    } finally {
      setLoading(false);
    }
  }, [bookingId, currentTeamId]);

  useEffect(() => {
    if (!open || !bookingId) {
      setTeams([]);
      setPickId(null);
      setError(null);
      setQualifiedLabel("");
      setEarningsFinalized(false);
      setForceAssign(false);
      return;
    }
    void load();
  }, [open, bookingId, load]);

  async function onAssign() {
    if (!bookingId || !pickId) {
      emitAdminToast("Select a team.", "error");
      return;
    }
    const picked = teams.find((t) => t.id === pickId);
    if (!picked?.assignable) {
      emitAdminToast("That team cannot take this booking (capacity, roster, or qualification).", "error");
      return;
    }
    if (earningsFinalized && !forceAssign) {
      emitAdminToast(
        "Earnings are finalized for this booking. Enable Force assign to reopen earnings and continue.",
        "error",
      );
      return;
    }
    setAssigning(true);
    try {
      await assignTeamToBookingAdmin(bookingId, pickId, { force: forceAssign });
      emitAdminToast(
        forceAssign
          ? currentTeamId
            ? "Team changed (earnings reopened)."
            : "Team assigned (earnings reopened)."
          : currentTeamId
            ? "Team changed."
            : "Team assigned.",
        "success",
      );
      onOpenChange(false);
      await onAssigned?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Team assignment failed.";
      emitAdminToast(msg, "error");
      if (/finalized|Force assign/i.test(msg)) {
        setEarningsFinalized(true);
      }
    } finally {
      setAssigning(false);
    }
  }

  const isChange = Boolean(currentTeamId);

  return (
    <Dialog open={open} onOpenChange={(next) => !assigning && onOpenChange(next)}>
      <DialogContent className="max-w-lg rounded-2xl border-slate-200 p-0">
        <div className="border-b border-slate-100 px-6 py-5">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle className="text-xl text-slate-900">{isChange ? "Change team" : "Assign team"}</DialogTitle>
            {bookingLabel ? (
              <p className="text-sm text-slate-600">
                Booking <span className="font-semibold text-slate-800">{bookingLabel}</span>
              </p>
            ) : null}
            <p className="text-sm text-slate-500">
              Each team takes 1 job per day. Up to 3 team bookings per day across all teams.
            </p>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading teams…
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p>{error}</p>
              {bookingId ? (
                <button type="button" onClick={() => void load()} className="mt-2 text-sm font-semibold underline">
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && !error && teams.length > 0 ? (
            <>
              {qualifiedLabel ? (
                <p className="text-xs text-slate-500">
                  Showing teams with cleaners qualified for{" "}
                  <span className="font-semibold text-slate-700">{qualifiedLabel}</span> on the job date.
                </p>
              ) : null}
              <div className="grid gap-2">
                <label htmlFor="office-team-pick" className="text-sm font-medium text-slate-700">
                  Team
                </label>
                <select
                  id="office-team-pick"
                  value={pickId ?? ""}
                  onChange={(e) => setPickId(e.target.value || null)}
                  disabled={assigning}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-blue-300 focus:outline-none"
                >
                  <option value="">Select a team…</option>
                  {teams.map((t) => {
                    const qual = t.qualified_member_count ?? t.member_count;
                    const active = t.active_member_count ?? t.member_count;
                    const inactive = t.team_active === false;
                    const blocked = !t.assignable && t.assign_block_reason ? ` — ${t.assign_block_reason}` : "";
                    return (
                      <option key={t.id} value={t.id} disabled={!t.assignable}>
                        {t.name}
                        {inactive ? " · paused" : ""} · {qual}/{active} qualified · {t.used_slots_today}/
                        {t.capacity_per_day} today
                        {blocked}
                      </option>
                    );
                  })}
                </select>
              </div>
              {earningsFinalized ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <p className="text-xs leading-relaxed text-amber-950">
                    Cleaner line earnings are finalized for this booking. Assigning a team requires reopening earnings
                    first (or use Force assign below).
                  </p>
                  <label className="flex items-start gap-2 text-sm text-amber-950">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={forceAssign}
                      onChange={(e) => setForceAssign(e.target.checked)}
                      disabled={assigning}
                    />
                    <span>
                      <span className="font-semibold">Force assign</span> — reopen cleaner line earnings and sync the
                      team roster.
                    </span>
                  </label>
                </div>
              ) : null}
            </>
          ) : null}

          {!loading && !error && teams.length === 0 && bookingId ? (
            <p className="text-sm text-slate-500">No teams available for this booking date.</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            disabled={assigning}
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              assigning ||
              loading ||
              Boolean(error) ||
              !pickId ||
              (earningsFinalized && !forceAssign)
            }
            onClick={() => void onAssign()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {assigning ? "Saving…" : isChange ? "Save team" : "Assign team"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
