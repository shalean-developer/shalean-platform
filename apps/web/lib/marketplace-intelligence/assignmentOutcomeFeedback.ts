import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

const EMA_ALPHA = 0.15;

/**
 * 0–1 blend: on-time start (vs slot wall clock), post-job review vs cleaner trailing rating (when review exists).
 */
export function computeAssignmentOutcomeScore(input: {
  dateYmd: string | null;
  slotTimeHm: string | null;
  startedAt: string | null;
  reviewRating1to5: number | null;
  cleanerRating0to5: number | null;
}): number {
  let onTime = 0.82;
  const d = input.dateYmd?.trim() ?? "";
  const hm = input.slotTimeHm?.trim().slice(0, 5) ?? "";
  const startedIso = input.startedAt?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}$/.test(hm) && startedIso) {
    const slotMs = Date.parse(`${d}T${hm}:00`);
    const startMs = Date.parse(startedIso);
    if (Number.isFinite(slotMs) && Number.isFinite(startMs)) {
      const deltaMin = (startMs - slotMs) / 60_000;
      if (deltaMin <= 15) onTime = 1;
      else if (deltaMin <= 45) onTime = 0.88;
      else if (deltaMin <= 90) onTime = 0.72;
      else onTime = 0.55;
    }
  }

  let reviewQ = 0.8;
  if (input.reviewRating1to5 != null && Number.isFinite(input.reviewRating1to5)) {
    const r = Math.min(5, Math.max(1, input.reviewRating1to5));
    const baseline = input.cleanerRating0to5 != null ? Math.min(5, Math.max(0, input.cleanerRating0to5)) : 4.2;
    reviewQ = clamp01(0.55 + 0.12 * (r - baseline));
  }

  return Math.round(clamp01(0.45 * onTime + 0.55 * reviewQ) * 1000) / 1000;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * After a booking is marked completed: persist `assignment_outcome_score` and update cleaner EMA.
 * Idempotent-ish: safe to call multiple times; overwrites outcome score with latest computation.
 */
export async function recordAssignmentOutcomeAndLearn(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ ok: boolean; score?: number; error?: string }> {
  const { data: row, error } = await supabase
    .from("bookings")
    .select("id, cleaner_id, date, time, started_at, completed_at, status, assignment_outcome_score")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row) return { ok: false, error: error?.message ?? "not_found" };
  const st = String((row as { status?: string }).status ?? "").toLowerCase();
  if (st !== "completed") return { ok: false, error: "not_completed" };
  if ((row as { assignment_outcome_score?: number | null }).assignment_outcome_score != null) {
    return { ok: true, score: Number((row as { assignment_outcome_score: number }).assignment_outcome_score) };
  }

  const cleanerId = String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
  if (!cleanerId) return { ok: false, error: "no_cleaner" };

  const { data: rev } = await supabase
    .from("reviews")
    .select("rating")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const { data: cl } = await supabase.from("cleaners").select("rating, marketplace_outcome_ema, marketplace_outcome_samples").eq("id", cleanerId).maybeSingle();

  const reviewRating =
    rev && typeof rev === "object" && "rating" in rev ? Number((rev as { rating?: number }).rating) : null;
  const cleanerRating = cl && typeof cl === "object" ? Number((cl as { rating?: number }).rating ?? 0) : null;

  const score = computeAssignmentOutcomeScore({
    dateYmd: String((row as { date?: string | null }).date ?? "").trim() || null,
    slotTimeHm: String((row as { time?: string | null }).time ?? ""),
    startedAt: String((row as { started_at?: string | null }).started_at ?? ""),
    reviewRating1to5: reviewRating != null && Number.isFinite(reviewRating) ? reviewRating : null,
    cleanerRating0to5: cleanerRating != null && Number.isFinite(cleanerRating) ? cleanerRating : null,
  });

  await supabase.from("bookings").update({ assignment_outcome_score: score }).eq("id", bookingId);

  const prevEma =
    cl && typeof cl === "object" && (cl as { marketplace_outcome_ema?: number | null }).marketplace_outcome_ema != null
      ? Number((cl as { marketplace_outcome_ema: number | null }).marketplace_outcome_ema)
      : null;
  const prevN =
    cl && typeof cl === "object" ? Number((cl as { marketplace_outcome_samples?: number }).marketplace_outcome_samples ?? 0) : 0;

  const nextEma = prevEma == null || !Number.isFinite(prevEma) ? score : EMA_ALPHA * score + (1 - EMA_ALPHA) * prevEma;

  await supabase
    .from("cleaners")
    .update({
      marketplace_outcome_ema: nextEma,
      marketplace_outcome_samples: prevN + 1,
    })
    .eq("id", cleanerId);

  void logSystemEvent({
    level: "info",
    source: "marketplace_outcome_learned",
    message: "Recorded assignment outcome and updated cleaner EMA",
    context: { bookingId, cleanerId, assignment_outcome_score: score, marketplace_outcome_ema: nextEma },
  });

  return { ok: true, score };
}
