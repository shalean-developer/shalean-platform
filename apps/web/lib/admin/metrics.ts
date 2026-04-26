import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";

export type DispatchMetricsWindow = "24h" | "7d";

/**
 * Single denominator for terminal assignment outcomes — one log row per completed assignment attempt.
 * Use for success / failure / no-candidate / capacity-per-attempt rates so everything stays consistent.
 */
export const attemptSources = [
  "TEAM_ASSIGNMENT_SUCCESS",
  "TEAM_ASSIGNMENT_FAILED",
  "TEAM_ASSIGNMENT_NO_CANDIDATES",
] as const;

export type DispatchAssignmentAttemptSource = (typeof attemptSources)[number];

const ALLOCATION_METRIC_SOURCE = "TEAM_ASSIGNMENT_ALLOCATION_METRIC";

/** Operations timezone for “today” utilization (SAST, no DST). */
export const DISPATCH_METRICS_UTILIZATION_TIMEZONE = "Africa/Johannesburg";

export type TeamUtilizationRow = {
  teamId: string;
  name: string;
  capacityPerDay: number;
  jobsToday: number;
  utilization: number | null;
  utilizationLabel: "high" | "medium" | "low" | "na";
  activeMembersToday: number;
  /** Jobs today >= capacity (ops signal). */
  atCapacity: boolean;
};

export type StaffingMismatchRow = {
  teamId: string;
  name: string;
  activeMembersToday: number;
  capacityPerDay: number;
};

/** Log-derived metrics for one time band [sinceIso, untilIso). */
export type DispatchMetricsLogBand = {
  sinceIso: string;
  untilIso: string;
  assignmentAttempts: number;
  assignmentSuccess: number;
  assignmentFailed: number;
  assignmentNoCandidates: number;
  /** True when SUCCESS + FAILED + NO_CANDIDATES === assignmentAttempts (same window). */
  attemptsSanityOk: boolean;
  assignmentSuccessRate: number | null;
  assignmentFailureRate: number | null;
  noCandidateRate: number | null;
  /** Capacity rejects per terminal attempt (teams exist but slots full). */
  capacityRejectRatePerAttempt: number | null;
  /** Fallback logs per successful assignment (ordering / contention). */
  fallbackRateVsSuccess: number | null;
  memberAddFailureRate: number | null;
  assignmentFallback: number;
  capacityRejected: number;
  memberAddEvents: number;
  memberAddFailed: number;
  allocationMetricRows: number;
  avgAttempts: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgFallbackDepth: number | null;
  /** Share of successful allocation metrics where fallback depth &gt; 0. */
  pctSuccessMetricsWithFallbackDepth: number | null;
};

export type DispatchMetricsSnapshot = {
  window: DispatchMetricsWindow;
  sinceIso: string;
  untilIso: string;
  /** Calendar “today” in {@link DISPATCH_METRICS_UTILIZATION_TIMEZONE} (YYYY-MM-DD). */
  todayYmdJohannesburg: string;
  current: DispatchMetricsLogBand;
  /** Prior window of equal length (for deltas). Allocation-derived fields may be nulls / zeros. */
  previous: DispatchMetricsLogBand;
  /** Point change vs prior window (percentage points, e.g. +3 means +3 pp). */
  rateDeltas: DispatchMetricsRateDelta;
  teams: TeamUtilizationRow[];
  staffingMismatches: StaffingMismatchRow[];
  /** True when the current window has no terminal assignment logs (rates stay null; avoid “0%”). */
  hasDispatchActivity: boolean;
};

export function dispatchMetricsWindowToHours(w: DispatchMetricsWindow): number {
  return w === "24h" ? 24 : 24 * 7;
}

export function utcCalendarDateYmd(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar date YYYY-MM-DD in the given IANA timezone (e.g. Africa/Johannesburg). */
export function calendarDateYmdInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * [start, endExclusive) UTC instants for a calendar date interpreted in Africa/Johannesburg (SAST = UTC+2, no DST).
 * Uses `YYYY-MM-DDTHH:mm:ss+02:00` parsing so it matches Johannesburg wall time.
 */
export function johannesburgDayUtcBounds(ymd: string): { startIso: string; endExclusiveIso: string } {
  const d = String(ymd).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`Invalid YMD for Johannesburg bounds: ${ymd}`);
  }
  const start = new Date(`${d}T00:00:00+02:00`);
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endExclusiveIso: endExclusive.toISOString() };
}

/** Linear interpolation percentile (0–1), robust for small n. */
export function percentileLinear(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length || p < 0 || p > 1) return null;
  if (sortedAsc.length === 1) return sortedAsc[0] ?? null;
  const pos = (sortedAsc.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sortedAsc[lo] ?? 0;
  const b = sortedAsc[hi] ?? a;
  if (lo === hi) return a;
  return a + (b - a) * (pos - lo);
}

async function countLogsBetween(
  admin: SupabaseClient,
  startIso: string,
  endIsoExclusive: string | null,
  build: (q: any) => any,
): Promise<number> {
  let q = admin.from("system_logs").select("id", { count: "exact", head: true }).gte("created_at", startIso);
  if (endIsoExclusive) q = q.lt("created_at", endIsoExclusive);
  const { count, error } = (await build(q)) as unknown as { count: number | null; error: PostgrestError | null };
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchAllocationMetricContexts(
  admin: SupabaseClient,
  startIso: string,
  endIsoExclusive: string | null,
  maxRows = 25_000,
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = from + pageSize - 1;
    let q = admin
      .from("system_logs")
      .select("context")
      .eq("source", ALLOCATION_METRIC_SOURCE)
      .gte("created_at", startIso)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (endIsoExclusive) q = q.lt("created_at", endIsoExclusive);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) {
      if (row && typeof row === "object" && "context" in row) {
        const ctx = (row as { context?: unknown }).context;
        if (ctx && typeof ctx === "object") out.push(ctx as Record<string, unknown>);
      }
    }
    if (batch.length < pageSize) break;
  }
  return out;
}

function numFromContext(ctx: Record<string, unknown>, key: string): number | null {
  const v = ctx[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function boolFromContext(ctx: Record<string, unknown>, key: string): boolean | null {
  const v = ctx[key];
  if (typeof v === "boolean") return v;
  return null;
}

function strFromContext(ctx: Record<string, unknown>, key: string): string | undefined {
  const v = ctx[key];
  return typeof v === "string" ? v : undefined;
}

type AllocationAgg = {
  allocationMetricRows: number;
  avgAttempts: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgFallbackDepth: number | null;
  pctSuccessMetricsWithFallbackDepth: number | null;
};

function aggregateAllocationContexts(contexts: Record<string, unknown>[]): AllocationAgg {
  const latenciesMs: number[] = [];
  const successAttempts: number[] = [];
  const fallbackDepths: number[] = [];
  let successMetricRows = 0;
  let successMetricRowsWithFallbackDepthPositive = 0;

  for (const ctx of contexts) {
    const outcome = strFromContext(ctx, "outcome");
    const rawMs = numFromContext(ctx, "assignmentDurationMs");
    if (rawMs != null && Number.isFinite(rawMs) && rawMs >= 0) latenciesMs.push(rawMs);

    if (outcome !== "success") continue;

    const ac = numFromContext(ctx, "attemptCount") ?? numFromContext(ctx, "attemptIndex");
    if (ac != null && Number.isFinite(ac) && ac >= 0) {
      successAttempts.push(ac);
      const depth = Math.max(0, Math.round(ac) - 1);
      fallbackDepths.push(depth);
      successMetricRows += 1;
      const fu = boolFromContext(ctx, "fallbackUsed");
      if (depth > 0 || fu === true) successMetricRowsWithFallbackDepthPositive += 1;
    }
  }

  latenciesMs.sort((a, b) => a - b);
  const p50LatencyMs = percentileLinear(latenciesMs, 0.5);
  const p95LatencyMs = percentileLinear(latenciesMs, 0.95);
  const avgAttempts =
    successAttempts.length > 0 ? successAttempts.reduce((a, b) => a + b, 0) / successAttempts.length : null;
  const avgFallbackDepth =
    fallbackDepths.length > 0 ? fallbackDepths.reduce((a, b) => a + b, 0) / fallbackDepths.length : null;
  const pctSuccessMetricsWithFallbackDepth =
    successMetricRows > 0 ? successMetricRowsWithFallbackDepthPositive / successMetricRows : null;

  return {
    allocationMetricRows: contexts.length,
    avgAttempts,
    p50LatencyMs,
    p95LatencyMs,
    avgFallbackDepth,
    pctSuccessMetricsWithFallbackDepth,
  };
}

async function loadLogBand(
  admin: SupabaseClient,
  sinceIso: string,
  untilIso: string,
  options: { includeAllocationFetch: boolean },
): Promise<DispatchMetricsLogBand> {
  const endExclusive = untilIso;

  const [
    terminalFromAttemptSources,
    assignmentSuccess,
    assignmentFailed,
    assignmentNoCandidates,
    assignmentFallback,
    capacityRejected,
    memberAddFailed,
    memberAddEvents,
  ] = await Promise.all([
    countLogsBetween(admin, sinceIso, endExclusive, (q) => q.in("source", [...attemptSources])),
    countLogsBetween(admin, sinceIso, endExclusive, (q) => q.eq("source", "TEAM_ASSIGNMENT_SUCCESS")),
    countLogsBetween(admin, sinceIso, endExclusive, (q) => q.eq("source", "TEAM_ASSIGNMENT_FAILED")),
    countLogsBetween(admin, sinceIso, endExclusive, (q) => q.eq("source", "TEAM_ASSIGNMENT_NO_CANDIDATES")),
    countLogsBetween(admin, sinceIso, endExclusive, (q) => q.eq("source", "TEAM_ASSIGNMENT_FALLBACK")),
    countLogsBetween(admin, sinceIso, endExclusive, (q) => q.eq("source", "TEAM_CAPACITY_REJECTED")),
    countLogsBetween(admin, sinceIso, endExclusive, (q) => q.eq("source", "TEAM_MEMBERS_ADD_FAILED")),
    countLogsBetween(admin, sinceIso, endExclusive, (q) => q.like("source", "TEAM_MEMBERS_ADD%")),
  ]);

  const assignmentAttempts = assignmentSuccess + assignmentFailed + assignmentNoCandidates;
  const attemptsSanityOk = terminalFromAttemptSources === assignmentAttempts;

  const assignmentSuccessRate = assignmentAttempts > 0 ? assignmentSuccess / assignmentAttempts : null;
  const assignmentFailureRate = assignmentAttempts > 0 ? assignmentFailed / assignmentAttempts : null;
  const noCandidateRate = assignmentAttempts > 0 ? assignmentNoCandidates / assignmentAttempts : null;
  const capacityRejectRatePerAttempt = assignmentAttempts > 0 ? capacityRejected / assignmentAttempts : null;
  const fallbackRateVsSuccess = assignmentSuccess > 0 ? assignmentFallback / assignmentSuccess : null;
  const memberAddFailureRate = memberAddEvents > 0 ? memberAddFailed / memberAddEvents : null;

  let allocationMetricRows = 0;
  let avgAttempts: number | null = null;
  let p50LatencyMs: number | null = null;
  let p95LatencyMs: number | null = null;
  let avgFallbackDepth: number | null = null;
  let pctSuccessMetricsWithFallbackDepth: number | null = null;

  if (options.includeAllocationFetch) {
    const allocationContexts = await fetchAllocationMetricContexts(admin, sinceIso, endExclusive);
    const agg = aggregateAllocationContexts(allocationContexts);
    allocationMetricRows = agg.allocationMetricRows;
    avgAttempts = agg.avgAttempts;
    p50LatencyMs = agg.p50LatencyMs;
    p95LatencyMs = agg.p95LatencyMs;
    avgFallbackDepth = agg.avgFallbackDepth;
    pctSuccessMetricsWithFallbackDepth = agg.pctSuccessMetricsWithFallbackDepth;
  }

  return {
    sinceIso,
    untilIso,
    assignmentAttempts,
    assignmentSuccess,
    assignmentFailed,
    assignmentNoCandidates,
    attemptsSanityOk,
    assignmentSuccessRate,
    assignmentFailureRate,
    noCandidateRate,
    capacityRejectRatePerAttempt,
    fallbackRateVsSuccess,
    memberAddFailureRate,
    assignmentFallback,
    capacityRejected,
    memberAddEvents,
    memberAddFailed,
    allocationMetricRows,
    avgAttempts,
    p50LatencyMs,
    p95LatencyMs,
    avgFallbackDepth,
    pctSuccessMetricsWithFallbackDepth,
  };
}

function deltaPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return (current - previous) * 100;
}

export type DispatchMetricsRateDelta = {
  successRatePctPoints: number | null;
  failureRatePctPoints: number | null;
  noCandidateRatePctPoints: number | null;
  capacityRejectPerAttemptPctPoints: number | null;
  fallbackRateVsSuccessPctPoints: number | null;
  memberAddFailureRatePctPoints: number | null;
};

export function computeRateDeltas(current: DispatchMetricsLogBand, previous: DispatchMetricsLogBand): DispatchMetricsRateDelta {
  return {
    successRatePctPoints: deltaPct(current.assignmentSuccessRate, previous.assignmentSuccessRate),
    failureRatePctPoints: deltaPct(current.assignmentFailureRate, previous.assignmentFailureRate),
    noCandidateRatePctPoints: deltaPct(current.noCandidateRate, previous.noCandidateRate),
    capacityRejectPerAttemptPctPoints: deltaPct(
      current.capacityRejectRatePerAttempt,
      previous.capacityRejectRatePerAttempt,
    ),
    fallbackRateVsSuccessPctPoints: deltaPct(current.fallbackRateVsSuccess, previous.fallbackRateVsSuccess),
    memberAddFailureRatePctPoints: deltaPct(current.memberAddFailureRate, previous.memberAddFailureRate),
  };
}

/**
 * Loads dispatch + staffing metrics (service-role client). Intended to run on the server only.
 */
export async function loadDispatchMetricsSnapshot(
  admin: SupabaseClient,
  window: DispatchMetricsWindow,
): Promise<DispatchMetricsSnapshot> {
  const hours = dispatchMetricsWindowToHours(window);
  const untilIso = new Date().toISOString();
  const sinceMs = Date.now() - hours * 3600_000;
  const sinceIso = new Date(sinceMs).toISOString();
  const prevUntilIso = sinceIso;
  const prevSinceIso = new Date(sinceMs - hours * 3600_000).toISOString();

  const todayYmdJohannesburg = calendarDateYmdInTimeZone(new Date(), DISPATCH_METRICS_UTILIZATION_TIMEZONE);
  const { startIso: dayStart, endExclusiveIso: dayEndExclusive } = johannesburgDayUtcBounds(todayYmdJohannesburg);

  const [current, previous] = await Promise.all([
    loadLogBand(admin, sinceIso, untilIso, { includeAllocationFetch: true }),
    loadLogBand(admin, prevSinceIso, prevUntilIso, { includeAllocationFetch: false }),
  ]);

  const hasDispatchActivity =
    current.assignmentAttempts > 0 || current.allocationMetricRows > 0 || current.memberAddEvents > 0;

  const { data: teamRows, error: teamErr } = await admin
    .from("teams")
    .select("id, name, capacity_per_day")
    .order("name", { ascending: true });
  if (teamErr) throw new Error(teamErr.message);

  const teams = (teamRows ?? []) as { id: string; name: string; capacity_per_day: number }[];

  const { data: bookingRows, error: bookErr } = await admin
    .from("bookings")
    .select("team_id")
    .eq("is_team_job", true)
    .gte("created_at", dayStart)
    .lt("created_at", dayEndExclusive)
    .not("team_id", "is", null);
  if (bookErr) throw new Error(bookErr.message);

  const jobsByTeam = new Map<string, number>();
  for (const row of bookingRows ?? []) {
    const tid = String((row as { team_id?: string | null }).team_id ?? "").trim();
    if (!tid) continue;
    jobsByTeam.set(tid, (jobsByTeam.get(tid) ?? 0) + 1);
  }

  const { data: memberRows, error: memErr } = await admin
    .from("team_members")
    .select("team_id, cleaner_id, active_from, active_to")
    .not("cleaner_id", "is", null);
  if (memErr) throw new Error(memErr.message);

  const membersByTeam = new Map<string, { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null }[]>();
  for (const raw of memberRows ?? []) {
    const row = raw as {
      team_id?: string | null;
      cleaner_id?: string | null;
      active_from?: string | null;
      active_to?: string | null;
    };
    const tid = String(row.team_id ?? "").trim();
    if (!tid) continue;
    if (!membersByTeam.has(tid)) membersByTeam.set(tid, []);
    membersByTeam.get(tid)!.push(row);
  }

  const teamUtilization: TeamUtilizationRow[] = [];
  const staffingMismatches: StaffingMismatchRow[] = [];

  for (const t of teams) {
    const cap = Number(t.capacity_per_day);
    const jobsToday = jobsByTeam.get(t.id) ?? 0;
    const roster = membersByTeam.get(t.id) ?? [];
    const activeMembersToday = countActiveTeamMembersOnDate(roster, todayYmdJohannesburg);
    const utilization = cap > 0 ? jobsToday / cap : null;
    let utilizationLabel: TeamUtilizationRow["utilizationLabel"] = "na";
    if (utilization != null) {
      if (utilization > 0.9) utilizationLabel = "high";
      else if (utilization >= 0.6) utilizationLabel = "medium";
      else utilizationLabel = "low";
    }
    const atCapacity = cap > 0 && jobsToday >= cap;
    teamUtilization.push({
      teamId: t.id,
      name: t.name,
      capacityPerDay: cap,
      jobsToday,
      utilization,
      utilizationLabel,
      activeMembersToday,
      atCapacity,
    });
    if (activeMembersToday !== cap) {
      staffingMismatches.push({
        teamId: t.id,
        name: t.name,
        activeMembersToday,
        capacityPerDay: cap,
      });
    }
  }

  teamUtilization.sort((a, b) => {
    const ua = a.utilization ?? -1;
    const ub = b.utilization ?? -1;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name);
  });

  return {
    window,
    sinceIso,
    untilIso,
    todayYmdJohannesburg,
    current,
    previous,
    rateDeltas: computeRateDeltas(current, previous),
    teams: teamUtilization,
    staffingMismatches,
    hasDispatchActivity,
  };
}
