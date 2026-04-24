import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAssignEligibility, effectiveJobDurationMinutes } from "@/lib/admin/adminAssignEligibility";
import { rankCleanersForAutoAssign, type CleanerOption, type SlotEligibilityForRank } from "@/lib/admin/assignRanking";
import { emitSlaBreachManualEscalation } from "@/lib/admin/slaBreachEscalate";
import { performAdminAssignToCleaner } from "@/lib/admin/performAdminAssignToCleaner";

const DEFAULT_MAX = 40;

export const EXTREME_SLA_AUTO_ESCALATE_MINUTES = 60;

export type RunAdminAssignSmartParams = {
  bookingId: string;
  force: boolean;
  slaBreachMinutes?: number | null;
  maxAttempts?: number;
  /** When set, only these cleaners are considered (e.g. admin roster). */
  cleanerIds?: string[] | null;
  /**
   * When confirm is true and sla breach is extreme, emit escalation if every assign attempt failed.
   */
  autoEscalateExtremeSla?: { confirm: true; slaBreachMinutes: number } | null;
};

export type RunAdminAssignSmartResult =
  | { ok: true; cleanerId: string; offerId: string; expiresAt: string; attempts: number }
  | { ok: false; error: string; attempts: number; escalated?: boolean };

function eligMapToRankRecord(map: Map<string, { canAssignWithoutForce: boolean }>): Record<string, SlotEligibilityForRank> {
  const o: Record<string, SlotEligibilityForRank> = {};
  for (const [id, row] of map) {
    o[id] = { canAssignWithoutForce: row.canAssignWithoutForce };
  }
  return o;
}

/**
 * Server-side ranked cascade: eligibility → rank → try `performAdminAssignToCleaner` until success or cap.
 */
export async function runAdminAssignSmart(
  admin: SupabaseClient,
  params: RunAdminAssignSmartParams,
): Promise<RunAdminAssignSmartResult> {
  const {
    bookingId,
    force,
    slaBreachMinutes,
    maxAttempts = DEFAULT_MAX,
    cleanerIds: explicitIds,
    autoEscalateExtremeSla,
  } = params;

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, time, duration_minutes, city_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { ok: false, error: "Booking not found.", attempts: 0 };
  }

  const st = String((booking as { status?: string }).status ?? "").toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed") {
    return { ok: false, error: "Booking cannot be assigned in this state.", attempts: 0 };
  }

  const dateYmd = String((booking as { date?: string | null }).date ?? "").trim();
  const timeHm = String((booking as { time?: string | null }).time ?? "").trim();
  if (!/^\d{2}:\d{2}/.test(timeHm) || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { ok: false, error: "Booking has no valid date/time for slot checks.", attempts: 0 };
  }

  const durationMinutes = effectiveJobDurationMinutes(
    booking as { duration_minutes?: number | null },
  );

  let cleanerIds = (explicitIds ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 150);
  if (cleanerIds.length === 0) {
    const cityId = String((booking as { city_id?: string | null }).city_id ?? "").trim();
    let q = admin.from("cleaners").select("id, full_name, status, is_available, rating, jobs_completed").limit(200);
    if (cityId) q = q.eq("city_id", cityId);
    q = q.order("full_name", { ascending: true });
    const { data: rows } = await q;
    cleanerIds = (rows ?? []).map((r) => String((r as { id: string }).id));
  }

  if (cleanerIds.length === 0) {
    return { ok: false, error: "No cleaners in scope for this booking.", attempts: 0 };
  }

  const { data: cleanerRows } = await admin
    .from("cleaners")
    .select("id, full_name, status, is_available, rating, jobs_completed")
    .in("id", cleanerIds);

  const cleaners: CleanerOption[] = (cleanerRows ?? []).map((raw) => {
    const r = raw as {
      id: string;
      full_name?: string | null;
      status?: string | null;
      is_available?: boolean | null;
      rating?: number | null;
      jobs_completed?: number | null;
    };
    return {
      id: String(r.id),
      full_name: String(r.full_name ?? "").trim() || "Cleaner",
      status: r.status ?? null,
      is_available: r.is_available ?? null,
      rating: r.rating ?? null,
      jobs_completed: r.jobs_completed ?? null,
      distance_km: null,
      reliability_score: null,
    };
  });

  const eligMap = await computeAssignEligibility(admin, {
    bookingId,
    bookingDateYmd: dateYmd,
    bookingTimeHm: timeHm.slice(0, 5),
    durationMinutes,
    cleanerIds,
  });
  const eligRecord = eligMapToRankRecord(eligMap);

  const ranked = rankCleanersForAutoAssign(cleaners, eligRecord, {
    requireSlotOk: !force,
    slaBreachMinutes: slaBreachMinutes ?? null,
  });
  const toTry = ranked.slice(0, Math.min(maxAttempts, DEFAULT_MAX));

  let attempts = 0;
  let lastErr = "All assign attempts failed.";
  for (const c of toTry) {
    attempts += 1;
    const r = await performAdminAssignToCleaner(admin, {
      bookingId,
      cleanerId: c.id,
      force,
    });
    if (r.ok) {
      return {
        ok: true,
        cleanerId: r.cleanerId,
        offerId: r.offerId,
        expiresAt: r.expiresAtIso,
        attempts,
      };
    }
    lastErr = r.error;
    if (r.httpStatus === 401 || r.httpStatus === 403 || r.httpStatus === 404 || r.httpStatus >= 500) {
      return { ok: false, error: lastErr, attempts };
    }
  }

  let escalated = false;
  const esc = autoEscalateExtremeSla;
  if (
    esc?.confirm === true &&
    typeof esc.slaBreachMinutes === "number" &&
    esc.slaBreachMinutes > EXTREME_SLA_AUTO_ESCALATE_MINUTES
  ) {
    escalated = true;
    await emitSlaBreachManualEscalation({
      bookingId,
      slaBreachMinutes: esc.slaBreachMinutes,
      lastActionMinutesAgo: null,
    });
  }

  return { ok: false, error: lastErr, attempts, escalated };
}
