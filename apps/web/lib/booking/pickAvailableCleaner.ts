import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type CleanerPick = { id: string; phone: string; /** `cleaners.full_name` for WhatsApp template {{1}} */ fullName: string };

/** Booking statuses that occupy a cleaner for this date+time slot (avoid double-booking). */
export const SLOT_BUSY_STATUSES = [
  "assigned",
  "confirmed",
  "in_progress",
  "accepted",
  "on_the_way",
] as const;

/** Statuses that count toward same-day workload (fewer = higher dispatch priority). */
export const WORKLOAD_DAY_STATUSES = ["assigned", "confirmed", "in_progress"] as const;

const MAX_CLEANER_CANDIDATES = 100;
const DISPATCH_OFFER_LOOKBACK_DAYS = 60;
const DISPATCH_OFFER_SAMPLE_CAP = 4000;
const STREAK_OFFER_SAMPLE_CAP = 4000;
/** When no latency samples: neutral minutes (bounded to middle of 2–60 band). */
const DEFAULT_RESPONSE_TIME_MINUTES = 45;
/** Cap raw minutes before 2–60 clamp (EWMA / per-offer). */
const MAX_RESPONSE_TIME_MINUTES = 24 * 60;

const RECENT_DECLINE_MINUTES = 15;
const RECENT_ASSIGN_COOLDOWN_MINUTES = 10;
/** Same calendar day and start time within this many minutes → full cooldown penalty. */
const ASSIGN_COOLDOWN_SLOT_WINDOW_MINUTES = 120;

const DECLINE_SCORE_PENALTY = 5;
const ASSIGN_COOLDOWN_PENALTY_SAME_WINDOW = 3;
const ASSIGN_COOLDOWN_PENALTY_OTHER = 1;
const MAX_ACCEPT_STREAK_BONUS = 3;
const EXPLORATION_JITTER_MAX = 0.5;

type CleanerRow = {
  id: string;
  phone: string | null;
  phone_number: string | null;
  full_name?: string | null;
  acceptance_rate?: number | null;
  avg_response_time_ms?: number | null;
  total_offers?: number | null;
};

export type DispatchPickBehavior = {
  /** `dispatch_offers` reject or WhatsApp booking decline in the last {@link RECENT_DECLINE_MINUTES} minutes. */
  recentDecline?: boolean;
  /** Recent assignment on same day and within ±2h of this slot’s start time. */
  assignedRecentlySameWindow?: boolean;
  /** Any booking assigned to this cleaner in the last {@link RECENT_ASSIGN_COOLDOWN_MINUTES} minutes. */
  assignedRecentlyAny?: boolean;
  /** Consecutive `accepted` outcomes (most recent first), before streak cap. */
  acceptStreak?: number;
  /** Uniform exploration jitter in `[0, {@link EXPLORATION_JITTER_MAX}]` (caller passes `random() * max`). */
  explorationJitter?: number;
};

export type DispatchPickScoreComponents = {
  workload: number;
  speed: number;
  acceptance: number;
  declinePenalty: number;
  cooldownPenalty: number;
  streakBonus: number;
  exploration: number;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function normalizeHm(h: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h).trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeHmToMinutes(hm: string): number | null {
  const n = normalizeHm(hm);
  if (!n) return null;
  const [h, mi] = n.split(":").map((x) => Number(x));
  return h * 60 + mi;
}

/** Same job day and start times within ±{@link ASSIGN_COOLDOWN_SLOT_WINDOW_MINUTES} minutes. */
export function isAssignCooldownSameSlotWindow(
  assignedDate: string,
  assignedTime: string,
  slotDate: string,
  slotTime: string,
): boolean {
  if (String(assignedDate).trim() !== String(slotDate).trim()) return false;
  const a = timeHmToMinutes(assignedTime);
  const b = timeHmToMinutes(slotTime);
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= ASSIGN_COOLDOWN_SLOT_WINDOW_MINUTES;
}

export type DispatchPickScoreDetailed = {
  finalScore: number;
  components: DispatchPickScoreComponents;
  normalizedWorkload: number;
  boundedResponse: number;
  normalizedResponse: number;
  acceptanceRate01: number;
};

/**
 * Normalized dispatch score with decline / slot-aware cooldown / streak / exploration.
 */
export function computeDispatchPickScoreDetailed(params: {
  workload: number;
  responseTimeMinutes: number;
  acceptanceRate01: number;
  recentDecline: boolean;
  assignedRecentlySameWindow: boolean;
  assignedRecentlyAny: boolean;
  acceptStreak: number;
  explorationJitter: number;
}): DispatchPickScoreDetailed {
  const w = Number.isFinite(params.workload) ? Math.max(0, params.workload) : 0;
  const rRaw = Number.isFinite(params.responseTimeMinutes) ? Math.max(0, params.responseTimeMinutes) : DEFAULT_RESPONSE_TIME_MINUTES;
  const rawAccept = Number.isFinite(params.acceptanceRate01) ? params.acceptanceRate01 : 1;

  const normalizedWorkload = clamp01(Math.min(w, 5) / 5);
  const boundedResponse = Math.max(2, Math.min(rRaw, 60));
  const normalizedResponse = clamp01(boundedResponse / 60);
  const ar = clamp01(rawAccept);

  const workloadPts = (1 - normalizedWorkload) * 5;
  const speedPts = (1 - normalizedResponse) * 3;
  const acceptancePts = ar * 6;

  const declinePenalty = params.recentDecline ? -DECLINE_SCORE_PENALTY : 0;

  let cooldownPenalty = 0;
  if (params.assignedRecentlySameWindow) cooldownPenalty = -ASSIGN_COOLDOWN_PENALTY_SAME_WINDOW;
  else if (params.assignedRecentlyAny) cooldownPenalty = -ASSIGN_COOLDOWN_PENALTY_OTHER;

  const streakRaw = Number.isFinite(params.acceptStreak) ? Math.max(0, params.acceptStreak) : 0;
  const streakBonus = Math.min(streakRaw, MAX_ACCEPT_STREAK_BONUS);

  const exploration = Math.min(EXPLORATION_JITTER_MAX, Math.max(0, params.explorationJitter));

  const components: DispatchPickScoreComponents = {
    workload: workloadPts,
    speed: speedPts,
    acceptance: acceptancePts,
    declinePenalty,
    cooldownPenalty,
    streakBonus,
    exploration,
  };

  const finalScore =
    workloadPts + speedPts + acceptancePts + declinePenalty + cooldownPenalty + streakBonus + exploration;

  return {
    finalScore,
    components,
    normalizedWorkload,
    boundedResponse,
    normalizedResponse,
    acceptanceRate01: ar,
  };
}

/** @deprecated Prefer {@link computeDispatchPickScoreDetailed} for breakdowns. */
export function computeDispatchPickScore(
  params: {
    workload: number;
    responseTimeMinutes: number;
    acceptanceRate01: number;
  } & Partial<DispatchPickBehavior>,
): number {
  return computeDispatchPickScoreDetailed({
    workload: params.workload,
    responseTimeMinutes: params.responseTimeMinutes,
    acceptanceRate01: params.acceptanceRate01,
    recentDecline: params.recentDecline ?? false,
    assignedRecentlySameWindow: params.assignedRecentlySameWindow ?? false,
    assignedRecentlyAny: params.assignedRecentlyAny ?? false,
    acceptStreak: params.acceptStreak ?? 0,
    explorationJitter: params.explorationJitter ?? 0,
  }).finalScore;
}

function minutesBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return DEFAULT_RESPONSE_TIME_MINUTES;
  const ms = Math.max(0, b - a);
  return Math.min(MAX_RESPONSE_TIME_MINUTES, ms / 60_000);
}

async function fetchOfferResponseMinutesByCleaner(
  admin: SupabaseClient,
  cleanerIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!cleanerIds.length) return map;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DISPATCH_OFFER_LOOKBACK_DAYS);

  const { data, error } = await admin
    .from("dispatch_offers")
    .select("cleaner_id, created_at, responded_at")
    .in("cleaner_id", cleanerIds)
    .in("status", ["accepted", "rejected"])
    .not("responded_at", "is", null)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(DISPATCH_OFFER_SAMPLE_CAP);

  if (error) {
    console.warn("[pickAvailableCleaner] dispatch_offers latency sample failed", error.message);
    return map;
  }

  type Sum = { sum: number; n: number };
  const sums = new Map<string, Sum>();
  for (const row of data ?? []) {
    const r = row as { cleaner_id?: string; created_at?: string; responded_at?: string };
    const cid = typeof r.cleaner_id === "string" ? r.cleaner_id : "";
    const c0 = typeof r.created_at === "string" ? r.created_at : "";
    const c1 = typeof r.responded_at === "string" ? r.responded_at : "";
    if (!cid || !c0 || !c1) continue;
    const mins = minutesBetween(c0, c1);
    const cur = sums.get(cid) ?? { sum: 0, n: 0 };
    cur.sum += mins;
    cur.n += 1;
    sums.set(cid, cur);
  }
  for (const [cid, { sum, n }] of sums) {
    if (n > 0) map.set(cid, sum / n);
  }
  return map;
}

async function fetchCleanerIdsWithRecentRejectedOffers(
  admin: SupabaseClient,
  cleanerIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!cleanerIds.length) return set;

  const threshold = new Date(Date.now() - RECENT_DECLINE_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("dispatch_offers")
    .select("cleaner_id")
    .in("cleaner_id", cleanerIds)
    .eq("status", "rejected")
    .gte("responded_at", threshold);

  if (error) {
    console.warn("[pickAvailableCleaner] recent dispatch reject lookup failed", error.message);
    return set;
  }
  for (const row of data ?? []) {
    const id = (row as { cleaner_id?: string | null }).cleaner_id;
    if (typeof id === "string" && id) set.add(id);
  }
  return set;
}

/** WhatsApp decline on assigned booking (no `dispatch_offers` row). */
async function fetchCleanerIdsWithRecentWhatsAppBookingDecline(
  admin: SupabaseClient,
  cleanerIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!cleanerIds.length) return set;

  const threshold = new Date(Date.now() - RECENT_DECLINE_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("bookings")
    .select("last_declined_by_cleaner_id")
    .eq("status", "pending_assignment")
    .eq("dispatch_status", "unassigned")
    .gte("last_declined_at", threshold)
    .not("last_declined_by_cleaner_id", "is", null)
    .in("last_declined_by_cleaner_id", cleanerIds);

  if (error) {
    console.warn("[pickAvailableCleaner] recent WhatsApp decline lookup failed", error.message);
    return set;
  }
  for (const row of data ?? []) {
    const id = (row as { last_declined_by_cleaner_id?: string | null }).last_declined_by_cleaner_id;
    if (typeof id === "string" && id) set.add(id);
  }
  return set;
}

export type RecentAssignmentRow = { cleaner_id: string; date: string; time: string };

async function fetchRecentAssignmentsForCooldown(
  admin: SupabaseClient,
  cleanerIds: string[],
): Promise<RecentAssignmentRow[]> {
  if (!cleanerIds.length) return [];

  const threshold = new Date(Date.now() - RECENT_ASSIGN_COOLDOWN_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("bookings")
    .select("cleaner_id, date, time")
    .in("cleaner_id", cleanerIds)
    .not("assigned_at", "is", null)
    .gte("assigned_at", threshold);

  if (error) {
    console.warn("[pickAvailableCleaner] recent assignment cooldown lookup failed", error.message);
    return [];
  }

  const out: RecentAssignmentRow[] = [];
  for (const raw of data ?? []) {
    const r = raw as { cleaner_id?: string | null; date?: string | null; time?: string | null };
    const cid = typeof r.cleaner_id === "string" ? r.cleaner_id : "";
    const d = typeof r.date === "string" ? r.date.trim() : "";
    const t = typeof r.time === "string" ? r.time.trim() : "";
    if (!cid || !d || !t) continue;
    out.push({ cleaner_id: cid, date: d, time: t });
  }
  return out;
}

function classifyAssignmentCooldown(
  cleanerId: string,
  slotDate: string,
  slotTime: string,
  rows: RecentAssignmentRow[],
): { assignedRecentlySameWindow: boolean; assignedRecentlyAny: boolean } {
  const mine = rows.filter((r) => r.cleaner_id === cleanerId);
  if (!mine.length) return { assignedRecentlySameWindow: false, assignedRecentlyAny: false };
  const assignedRecentlyAny = true;
  const assignedRecentlySameWindow = mine.some((r) =>
    isAssignCooldownSameSlotWindow(r.date, r.time, slotDate, slotTime),
  );
  return { assignedRecentlySameWindow, assignedRecentlyAny };
}

async function fetchAcceptStreakByCleaner(admin: SupabaseClient, cleanerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!cleanerIds.length) return map;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);

  const { data, error } = await admin
    .from("dispatch_offers")
    .select("cleaner_id, status, responded_at")
    .in("cleaner_id", cleanerIds)
    .in("status", ["accepted", "rejected"])
    .not("responded_at", "is", null)
    .gte("created_at", since.toISOString())
    .order("responded_at", { ascending: false })
    .limit(STREAK_OFFER_SAMPLE_CAP);

  if (error) {
    console.warn("[pickAvailableCleaner] accept streak sample failed", error.message);
    return map;
  }

  type Row = { cleaner_id: string; status: string; responded_at: string };
  const byCleaner = new Map<string, Row[]>();
  for (const raw of data ?? []) {
    const r = raw as { cleaner_id?: string; status?: string; responded_at?: string };
    const cid = typeof r.cleaner_id === "string" ? r.cleaner_id : "";
    const st = typeof r.status === "string" ? r.status : "";
    const ra = typeof r.responded_at === "string" ? r.responded_at : "";
    if (!cid || !st || !ra) continue;
    if (st !== "accepted" && st !== "rejected") continue;
    const list = byCleaner.get(cid) ?? [];
    list.push({ cleaner_id: cid, status: st, responded_at: ra });
    byCleaner.set(cid, list);
  }

  for (const [cid, rows] of byCleaner) {
    rows.sort((a, b) => new Date(b.responded_at).getTime() - new Date(a.responded_at).getTime());
    let streak = 0;
    for (const o of rows) {
      if (o.status === "accepted") streak += 1;
      else break;
    }
    map.set(cid, streak);
  }
  return map;
}

async function fetchWorkloadByCleaner(
  admin: SupabaseClient,
  slotDate: string,
  cleanerIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!cleanerIds.length) return counts;

  const { data, error } = await admin
    .from("bookings")
    .select("cleaner_id")
    .eq("date", slotDate)
    .in("status", [...WORKLOAD_DAY_STATUSES])
    .in("cleaner_id", cleanerIds);

  if (error) {
    console.warn("[pickAvailableCleaner] workload query failed", error.message);
    return counts;
  }
  for (const row of data ?? []) {
    const id = (row as { cleaner_id?: string | null }).cleaner_id;
    if (typeof id !== "string" || !id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function pickRandomCleaner<T extends { id: string }>(eligible: T[], randomFn: () => number): T {
  return eligible[Math.floor(randomFn() * eligible.length)]!;
}

/**
 * Picks one eligible cleaner: `is_available`, has phone, not busy on slot, not in `excludeCleanerIds`.
 * Ranks with normalized score, dual decline signals, slot-aware cooldown, streak, and exploration jitter.
 */
export async function pickAvailableCleaner(
  admin: SupabaseClient,
  slotDate: string,
  slotTime: string,
  excludeCleanerIds: string[] = [],
  options?: { randomFn?: () => number },
): Promise<CleanerPick | null> {
  const randomFn = options?.randomFn ?? Math.random;
  const exclude = new Set(excludeCleanerIds.filter((id) => typeof id === "string" && id.length > 0));

  const { data: busyRows, error: busyErr } = await admin
    .from("bookings")
    .select("cleaner_id")
    .eq("date", slotDate)
    .eq("time", slotTime)
    .in("status", [...SLOT_BUSY_STATUSES])
    .not("cleaner_id", "is", null);

  if (busyErr) {
    console.error("[pickAvailableCleaner] slot conflict query failed", busyErr.message);
    return null;
  }

  const busyCleanerIds = new Set(
    (busyRows ?? [])
      .map((r) => (r as { cleaner_id?: string | null }).cleaner_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const { data: cleaners, error } = await admin
    .from("cleaners")
    .select("id, phone, phone_number, full_name, acceptance_rate, avg_response_time_ms, total_offers")
    .eq("is_available", true)
    .limit(MAX_CLEANER_CANDIDATES);

  if (error || !cleaners?.length) {
    if (error) console.error("[pickAvailableCleaner] cleaners query failed", error.message);
    return null;
  }

  const list = cleaners as CleanerRow[];
  const eligible = list.filter((c) => {
    const hasPhone = String(c.phone_number || c.phone || "").trim().length > 0;
    return hasPhone && !busyCleanerIds.has(c.id) && !exclude.has(c.id);
  });
  if (!eligible.length) return null;

  type Scored = CleanerRow & {
    workload: number;
    responseTime: number;
    acceptanceRate: number;
    finalScore: number;
    components: DispatchPickScoreComponents;
    recentDecline: boolean;
    assignedRecentlySameWindow: boolean;
    assignedRecentlyAny: boolean;
    acceptStreak: number;
  };

  function buildScores(
    workloadMap: Map<string, number>,
    offerMinutesMap: Map<string, number>,
    recentDecline: Set<string>,
    recentAssignRows: RecentAssignmentRow[],
    acceptStreakMap: Map<string, number>,
    pool: CleanerRow[],
  ): Scored[] {
    return pool.map((c) => {
      const workload = workloadMap.get(c.id) ?? 0;
      const offerAvg = offerMinutesMap.get(c.id);
      let responseTime: number;
      if (offerAvg != null && Number.isFinite(offerAvg)) {
        responseTime = offerAvg;
      } else if (c.avg_response_time_ms != null && c.avg_response_time_ms > 0 && Number.isFinite(c.avg_response_time_ms)) {
        responseTime = Math.min(MAX_RESPONSE_TIME_MINUTES, c.avg_response_time_ms / 60_000);
      } else {
        responseTime = DEFAULT_RESPONSE_TIME_MINUTES;
      }

      const totalOffers = typeof c.total_offers === "number" && c.total_offers > 0 ? c.total_offers : 0;
      const acceptanceRate =
        totalOffers > 0 && c.acceptance_rate != null && Number.isFinite(c.acceptance_rate)
          ? clamp01(c.acceptance_rate)
          : 1;

      const recentDecl = recentDecline.has(c.id);
      const { assignedRecentlySameWindow, assignedRecentlyAny } = classifyAssignmentCooldown(
        c.id,
        slotDate,
        slotTime,
        recentAssignRows,
      );
      const acceptStreak = acceptStreakMap.get(c.id) ?? 0;
      const explorationJitter = randomFn() * EXPLORATION_JITTER_MAX;

      const detailed = computeDispatchPickScoreDetailed({
        workload,
        responseTimeMinutes: responseTime,
        acceptanceRate01: acceptanceRate,
        recentDecline: recentDecl,
        assignedRecentlySameWindow,
        assignedRecentlyAny,
        acceptStreak,
        explorationJitter,
      });

      return {
        ...c,
        workload,
        responseTime,
        acceptanceRate,
        finalScore: detailed.finalScore,
        components: detailed.components,
        recentDecline: recentDecl,
        assignedRecentlySameWindow,
        assignedRecentlyAny,
        acceptStreak,
      };
    });
  }

  function logAndReturnPick(chosen: Scored): CleanerPick {
    const phone = String(chosen.phone_number || chosen.phone || "").trim();
    const fullName = String(chosen.full_name ?? "").trim() || "Cleaner";
    return { id: chosen.id, phone, fullName };
  }

  try {
    const ids = eligible.map((c) => c.id);
    const [workloadMap, offerMinutesMap, offerRejectIds, waDeclineIds, recentAssignRows, acceptStreakMap] =
      await Promise.all([
        fetchWorkloadByCleaner(admin, slotDate, ids),
        fetchOfferResponseMinutesByCleaner(admin, ids),
        fetchCleanerIdsWithRecentRejectedOffers(admin, ids),
        fetchCleanerIdsWithRecentWhatsAppBookingDecline(admin, ids),
        fetchRecentAssignmentsForCooldown(admin, ids),
        fetchAcceptStreakByCleaner(admin, ids),
      ]);

    const recentDecline = new Set<string>([...offerRejectIds, ...waDeclineIds]);

    const scored = buildScores(
      workloadMap,
      offerMinutesMap,
      recentDecline,
      recentAssignRows,
      acceptStreakMap,
      eligible,
    );
    let best = scored[0]!;
    for (const row of scored) {
      if (row.finalScore > best.finalScore) best = row;
    }
    const top = scored.filter((r) => r.finalScore === best.finalScore);
    const chosen = top.length > 1 ? pickRandomCleaner(top, randomFn) : best;
    return logAndReturnPick(chosen);
  } catch (err) {
    console.error("[pickAvailableCleaner] ranked pick failed, using random fallback", err);
    const c = pickRandomCleaner(eligible, randomFn);
    let workloadMap = new Map<string, number>();
    try {
      workloadMap = await fetchWorkloadByCleaner(admin, slotDate, [c.id]);
    } catch {
      /* keep empty */
    }
    const emptyDecline = new Set<string>();
    const scored = buildScores(workloadMap, new Map(), emptyDecline, [], new Map(), [c]);
    return logAndReturnPick(scored[0]!);
  }
}
