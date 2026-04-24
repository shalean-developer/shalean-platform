"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  clearAssignFailuresForBooking,
  isAssignFailureFresh,
  recordAssignFailure,
} from "@/lib/admin/assignFailureCache";
import {
  getBestCleaner,
  getBestCleanerForAssign,
  rankCleanersForAutoAssign,
  rankCleanersForPool,
  SLA_SPEED_FIRST_MINUTES,
  type CleanerOption,
} from "@/lib/admin/assignRanking";
import { EXTREME_SLA_AUTO_ESCALATE_MINUTES } from "@/lib/admin/runAdminAssignSmart";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export type { CleanerOption } from "@/lib/admin/assignRanking";
export {
  SLA_SPEED_FIRST_MINUTES,
  rankCleanersForAutoAssign,
  getBestCleanerForAssign,
  getBestCleaner,
};

const MAX_SMART_ATTEMPTS = 40;

/** Minimal booking fields for slot checks (must match assign-eligibility GET). */
export type AssignBookingFragment = {
  id: string;
  date?: string | null;
  time?: string | null;
  duration_minutes?: number | null;
};

export type AssignEligibilityUi = {
  slotCalendarOk: boolean;
  overlapBlocked: boolean;
  busyUntilLabel: string | null;
  /** Full overlap sentence for admins, e.g. "Busy until 12:00 (overlaps with 10:00–13:30 job)". */
  overlapExplain: string | null;
  /** Next same-day start (15m grid) that clears calendar + overlap for this cleaner. */
  nextAvailableHm: string | null;
  offline: boolean;
  canAssignWithoutForce: boolean;
};

function rosterCleaners(cleaners: CleanerOption[]): CleanerOption[] {
  return cleaners.filter(
    (c) => c.is_available === true || String(c.status ?? "").toLowerCase() === "available",
  );
}

type EligStatus = "idle" | "loading" | "ready" | "skipped" | "error";

function slotCheckable(date: string | null | undefined, time: string | null | undefined): boolean {
  const d = String(date ?? "").trim();
  const t = String(time ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}/.test(t);
}

function slotReason(e: AssignEligibilityUi): string {
  if (e.canAssignWithoutForce) return "OK for this slot";
  if (e.offline) return "Offline";
  if (e.overlapExplain) {
    return e.nextAvailableHm ? `${e.overlapExplain} · Next: ${e.nextAvailableHm}` : e.overlapExplain;
  }
  if (!e.slotCalendarOk) {
    return e.nextAvailableHm ? `No calendar window · Next: ${e.nextAvailableHm}` : "No calendar window";
  }
  return "Not slot-safe";
}

export function AdminAssignForm({
  booking,
  bookingId,
  cleaners,
  slaBreachMinutes,
  onCascadeExhausted,
  onDone,
  onError,
}: {
  booking: AssignBookingFragment;
  bookingId: string;
  cleaners: CleanerOption[];
  /** When set (e.g. SLA queue), high values switch auto-assign to speed-first ranking. */
  slaBreachMinutes?: number | null;
  /** Fired after smart assign exhausts all ranked cleaners (client 400s only), not on auth/server errors. */
  onCascadeExhausted?: () => void | Promise<void>;
  onDone: (args: { cleanerId: string; assignAttempts?: number }) => void;
  onError: (message: string) => void;
}) {
  const [cleanerId, setCleanerId] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progressNote, setProgressNote] = useState<string | null>(null);
  const [elig, setElig] = useState<Record<string, AssignEligibilityUi> | null>(null);
  const [eligStatus, setEligStatus] = useState<EligStatus>("idle");
  const [overlappingDemandInSlot, setOverlappingDemandInSlot] = useState<number | null>(null);
  const [extremeSlaEscalateConfirm, setExtremeSlaEscalateConfirm] = useState(false);

  const roster = useMemo(() => rosterCleaners(cleaners), [cleaners]);
  const cleanerIdsKey = useMemo(() => roster.map((c) => c.id).join(","), [roster]);
  const checkable = slotCheckable(booking.date, booking.time);

  useEffect(() => {
    setCleanerId("");
    setForce(false);
    setMsg(null);
    setExtremeSlaEscalateConfirm(false);
  }, [bookingId]);

  useEffect(() => {
    if (!checkable || roster.length === 0) {
      setElig(null);
      setEligStatus("skipped");
      setOverlappingDemandInSlot(null);
      return;
    }

    const ac = new AbortController();
    setEligStatus("loading");
    setElig(null);
    setOverlappingDemandInSlot(null);

    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!ac.signal.aborted) setEligStatus("error");
        return;
      }
      const ids = roster.map((c) => c.id).slice(0, 150);
      const q = ids.map(encodeURIComponent).join(",");
      try {
        const res = await fetch(
          `/api/admin/bookings/${encodeURIComponent(bookingId)}/assign-eligibility?cleanerIds=${q}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal },
        );
        const j = (await res.json()) as {
          eligibility?: Record<string, AssignEligibilityUi>;
          overlappingDemandInSlot?: number;
          error?: string;
        };
        if (!res.ok) {
          if (!ac.signal.aborted) setEligStatus("error");
          return;
        }
        if (!ac.signal.aborted) {
          const raw = j.eligibility ?? {};
          const normalized: Record<string, AssignEligibilityUi> = {};
          for (const [id, row] of Object.entries(raw)) {
            const r = row as AssignEligibilityUi;
            normalized[id] = {
              slotCalendarOk: Boolean(r.slotCalendarOk),
              overlapBlocked: Boolean(r.overlapBlocked),
              busyUntilLabel: r.busyUntilLabel ?? null,
              overlapExplain: r.overlapExplain ?? null,
              nextAvailableHm: r.nextAvailableHm ?? null,
              offline: Boolean(r.offline),
              canAssignWithoutForce: Boolean(r.canAssignWithoutForce),
            };
          }
          setElig(normalized);
          setOverlappingDemandInSlot(
            typeof j.overlappingDemandInSlot === "number" && Number.isFinite(j.overlappingDemandInSlot)
              ? j.overlappingDemandInSlot
              : null,
          );
          setEligStatus("ready");
        }
      } catch {
        if (!ac.signal.aborted) setEligStatus("error");
      }
    })();

    return () => ac.abort();
  }, [bookingId, booking.date, booking.time, booking.duration_minutes, checkable, cleanerIdsKey, roster.length]);

  const recommended = useMemo(() => {
    if (eligStatus !== "ready" || !elig) return null;
    return getBestCleanerForAssign(cleaners, elig, { requireSlotOk: !force, slaBreachMinutes });
  }, [cleaners, elig, eligStatus, force, slaBreachMinutes]);

  const slotOkList = useMemo(() => {
    if (eligStatus !== "ready" || !elig) return rankCleanersForPool(roster, slaBreachMinutes);
    const ok = roster.filter((c) => elig[c.id]?.canAssignWithoutForce);
    return rankCleanersForPool(ok, slaBreachMinutes);
  }, [roster, elig, eligStatus, slaBreachMinutes]);

  const blockedList = useMemo(() => {
    if (eligStatus !== "ready" || !elig) return [];
    const bad = roster.filter((c) => !elig[c.id]?.canAssignWithoutForce);
    return rankCleanersForPool(bad, slaBreachMinutes);
  }, [roster, elig, eligStatus, slaBreachMinutes]);

  const allowedIds = useMemo(() => {
    if (force || eligStatus !== "ready" || !elig) {
      return new Set(roster.map((c) => c.id));
    }
    return new Set(slotOkList.map((c) => c.id));
  }, [force, elig, eligStatus, roster, slotOkList]);

  useEffect(() => {
    if (!cleanerId) return;
    if (!allowedIds.has(cleanerId)) setCleanerId("");
  }, [allowedIds, cleanerId]);

  /** Preselect best slot-safe cleaner whenever roster/eligibility makes the current choice invalid or empty. */
  useEffect(() => {
    if (eligStatus !== "ready" || force || !elig) return;
    const best = getBestCleanerForAssign(cleaners, elig, { requireSlotOk: true, slaBreachMinutes });
    if (!best) return;
    setCleanerId((cur) => {
      if (cur === "") return best.id;
      const row = elig[cur];
      if (row?.canAssignWithoutForce) return cur;
      return best.id;
    });
  }, [eligStatus, force, elig, cleaners, cleanerId, slaBreachMinutes]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cleanerId.trim()) {
      setMsg("Pick a cleaner.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const sb = getSupabaseBrowser();
    const { data: sessionData } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    const token = sessionData.session?.access_token;
    if (!token) {
      setMsg("Session expired.");
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cleanerId: cleanerId.trim(), force }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      const err = j.error ?? "Failed to assign cleaner";
      if (res.status === 400) recordAssignFailure(bookingId, cleanerId.trim());
      setMsg(err);
      onError(err);
      setBusy(false);
      return;
    }
    clearAssignFailuresForBooking(bookingId);
    onDone({ cleanerId: cleanerId.trim() });
    setBusy(false);
  }

  async function autoAssign() {
    const eligMap = eligStatus === "ready" && elig ? elig : null;
    if (!force && eligStatus === "loading") {
      setMsg("Wait for slot check to finish, or enable override.");
      return;
    }
    const requireSlotOk = !force;
    const ranked = rankCleanersForAutoAssign(cleaners, eligMap, { requireSlotOk, slaBreachMinutes });
    const capped = ranked.slice(0, MAX_SMART_ATTEMPTS);
    const toTry = capped.filter((c) => !isAssignFailureFresh(bookingId, c.id));
    if (ranked.length === 0) {
      setMsg(
        force
          ? "No roster cleaners to auto-pick."
          : "No cleaners pass this slot without override. Enable override or fix calendar / conflicts.",
      );
      return;
    }
    if (toTry.length === 0) {
      setMsg(
        `All ${capped.length} ranked cleaner${capped.length === 1 ? "" : "s"} were skipped (assign failed <2 min ago). Wait or pick manually.`,
      );
      return;
    }

    setBusy(true);
    setMsg(null);
    setProgressNote("Smart assign (server)…");
    const sb = getSupabaseBrowser();
    const { data: sessionData } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    const token = sessionData.session?.access_token;
    if (!token) {
      setMsg("Session expired.");
      setProgressNote(null);
      setBusy(false);
      return;
    }

    const autoEscalateExtremeSla =
      extremeSlaEscalateConfirm &&
      slaBreachMinutes != null &&
      slaBreachMinutes > EXTREME_SLA_AUTO_ESCALATE_MINUTES
        ? ({ confirm: true as const, slaBreachMinutes } as const)
        : undefined;

    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign-smart`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        force,
        slaBreachMinutes: slaBreachMinutes ?? undefined,
        cleanerIds: toTry.map((c) => c.id),
        maxAttempts: MAX_SMART_ATTEMPTS,
        autoEscalateExtremeSla,
      }),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      error?: string;
      cleanerId?: string;
      attempts?: number;
      escalated?: boolean;
    };
    setProgressNote(null);
    if (res.ok && j.ok) {
      clearAssignFailuresForBooking(bookingId);
      if (j.cleanerId) setCleanerId(j.cleanerId);
      setBusy(false);
      onDone({ cleanerId: j.cleanerId ?? "", assignAttempts: j.attempts });
      return;
    }
    const err = j.error ?? "Smart assign failed.";
    setMsg(
      j.escalated ? `${err} · Escalation was notified (extreme SLA).` : err,
    );
    onError(err);
    if (!j.escalated) void Promise.resolve(onCascadeExhausted?.()).catch(() => {});
    setBusy(false);
  }

  function optionSuffix(c: CleanerOption): string {
    const dist =
      typeof c.distance_km === "number" && Number.isFinite(c.distance_km)
        ? `${c.distance_km.toFixed(1)} km · `
        : "";
    const rating = typeof c.rating === "number" ? `${c.rating.toFixed(1)}★` : "—";
    const jobs = c.jobs_completed ?? 0;
    if (eligStatus === "loading") {
      return ` · ${dist}${rating} · jobs ${jobs} · …`;
    }
    if (eligStatus === "skipped" || eligStatus === "error" || !elig) {
      return ` · ${dist}${rating} · jobs ${jobs} · On roster`;
    }
    const e = elig[c.id];
    if (!e) return ` · ${dist}${rating} · jobs ${jobs} · On roster`;
    return ` · ${dist}${rating} · jobs ${jobs} · ${slotReason(e)}`;
  }

  const showSlotHint =
    checkable && eligStatus === "ready" && !force && slotOkList.length === 0 && roster.length > 0;

  return (
    <form
      onSubmit={submit}
      className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900/80"
    >
      {!checkable ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-200">
          This booking has no valid date/time — slot checks are skipped; assign still enforces server rules when
          possible.
        </p>
      ) : eligStatus === "loading" ? (
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">Checking slot vs roster…</p>
      ) : eligStatus === "error" ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-200">Could not load slot eligibility (session?).</p>
      ) : null}

      {checkable &&
      eligStatus === "ready" &&
      overlappingDemandInSlot != null &&
      overlappingDemandInSlot >= 2 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">⚠️ {overlappingDemandInSlot} bookings overlap this time</p>
          <p>You may need {overlappingDemandInSlot} cleaners — one cleaner cannot cover parallel jobs.</p>
        </div>
      ) : null}

      {recommended ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-semibold">Suggested for this slot</p>
          <p>
            {recommended.full_name}
            {typeof recommended.distance_km === "number" ? ` · ${recommended.distance_km.toFixed(1)} km` : ""}
            {typeof recommended.rating === "number" ? ` · ${recommended.rating.toFixed(1)}★` : ""}
          </p>
        </div>
      ) : eligStatus === "ready" && checkable && !force ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">No slot-safe cleaner in this list</p>
          <p>Enable override to assign anyway, or widen roster / calendar / resolve overlaps.</p>
        </div>
      ) : null}

      {showSlotHint ? (
        <p className="text-[11px] text-amber-900 dark:text-amber-100">
          No cleaners pass this slot without override — turn on override to see everyone.
        </p>
      ) : null}

      <select
        value={cleanerId}
        onChange={(e) => setCleanerId(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
      >
        <option value="">Select cleaner…</option>
        {eligStatus === "ready" && !force && elig ? (
          <>
            {slotOkList.length > 0 ? (
              <optgroup label="OK for this slot">
                {slotOkList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {optionSuffix(c)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </>
        ) : eligStatus === "ready" && force && elig ? (
          <>
            {slotOkList.length > 0 ? (
              <optgroup label="OK for this slot">
                {slotOkList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {optionSuffix(c)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {blockedList.length > 0 ? (
              <optgroup label="Override only (calendar / overlap / offline)">
                {blockedList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {optionSuffix(c)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </>
        ) : (
          roster.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
              {optionSuffix(c)}
            </option>
          ))
        )}
      </select>
      <label className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        Override slot checks (calendar, overlapping jobs, offline)
      </label>
      {force ? (
        <p className="text-[11px] font-medium text-rose-800 dark:text-rose-200">
          ⚠️ Override can double-book a cleaner or send them outside their calendar. Only use when you accept that
          risk.
        </p>
      ) : null}
      {slaBreachMinutes != null && slaBreachMinutes > EXTREME_SLA_AUTO_ESCALATE_MINUTES ? (
        <label className="flex items-start gap-2 text-[11px] text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={extremeSlaEscalateConfirm}
            onChange={(e) => setExtremeSlaEscalateConfirm(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            If smart assign still fails, <span className="font-semibold">auto-notify escalation</span> (same pipeline
            as Escalate) — only when SLA is over {EXTREME_SLA_AUTO_ESCALATE_MINUTES} minutes.
          </span>
        </label>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-emerald-600 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Apply assignment"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void autoAssign()}
        className="w-full rounded-md border border-zinc-300 bg-white py-1.5 text-xs font-semibold text-zinc-800 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {busy ? "Working…" : "Smart auto assign"}
      </button>
      <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
        One server request ranks cleaners and tries in order (max {MAX_SMART_ATTEMPTS}). Parallel client tries stay
        unsafe because each assign mutates the booking.
        {slaBreachMinutes != null && slaBreachMinutes >= SLA_SPEED_FIRST_MINUTES ? (
          <>
            {" "}
            <span className="font-medium text-amber-800 dark:text-amber-200">
              SLA {slaBreachMinutes}m: speed-first (rating → reliability → distance).
            </span>
          </>
        ) : (
          <> Default: distance → rating → reliability/jobs.</>
        )}{" "}
        Skips cleaners who failed manual assign in the last 2 minutes (client hint).
      </p>
      {progressNote ? (
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">{progressNote}</p>
      ) : null}
      {msg ? <p className="text-[11px] text-red-600 dark:text-red-400">{msg}</p> : null}
    </form>
  );
}
