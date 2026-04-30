import type { SupabaseClient } from "@supabase/supabase-js";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { newTeamAssignmentErrorId } from "@/lib/dispatch/teamAssignmentErrorId";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

/**
 * Statuses that consume a team-day slot for allocator + RPC alignment.
 * Keep in sync with `public.claim_team_capacity_slot` / `team_daily_capacity_usage` semantics.
 */
export const CAPACITY_STATUSES = ["pending", "assigned", "in_progress"] as const;

const CAPACITY_STATUS_SET = new Set<string>(CAPACITY_STATUSES);

function isCapacityConsumingStatus(status: string | null | undefined): boolean {
  return CAPACITY_STATUS_SET.has(String(status ?? "").toLowerCase());
}

type TeamRow = {
  id: string;
  capacity_per_day: number;
};

/** Hard floor for `capacity_per_day` when scoring or comparing load (avoids divide-by-zero / NaN). */
function teamDayCapacitySlots(team: Pick<TeamRow, "capacity_per_day">): number {
  return Math.max(1, Number(team.capacity_per_day ?? 0) || 0);
}

export type TeamAssignResult =
  | { ok: true; teamId: string }
  | {
      ok: false;
      error: "no_candidate" | "booking_not_pending" | "db_error";
      message?: string;
      /** Machine-stable diagnostic (e.g. `team_payout_owner_unresolved`). */
      code?: string;
      booking_id?: string;
      team_id?: string;
      /** Correlates UI / API responses with `system_logs` (e.g. `TA-7F3A1B2C`). */
      error_id?: string;
    };

type TeamCandidate = TeamRow & {
  rosterSnapshot: number;
  /** Task 1: assigned + in_progress on booking date (load signal). */
  assignedJobsToday: number;
  /** Slots counted like capacity RPC — statuses in {@link CAPACITY_STATUSES}. */
  slotLoadForCapacity: number;
  /** Sort key: assignedJobsToday + optional same-timeslot weight (see TEAM_ASSIGN_SLOT_LOAD_WEIGHT). */
  loadScore: number;
};

/** FNV-1a 32-bit — stable, deterministic spread for tie buckets. */
function hashStringToPositiveInt(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Normalize `bookings.time` to `HH:MM` (zero-padded) for same-slot matching — align with slot labels
 * generated in booking flows (e.g. `08:00`, not `8:0`).
 */
function normalizeBookingTimeSlotKey(time: string | null | undefined): string | null {
  const t = String(time ?? "").trim();
  if (!t) return null;
  const m = t.match(/\b(\d{1,2}):(\d{1,2})\b/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1]!, 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2]!, 10)));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Parsed slot-load weight, clamped so misconfig cannot dominate `assignedJobsToday`. */
function readTeamAssignSlotLoadWeight(): number {
  const raw = process.env.TEAM_ASSIGN_SLOT_LOAD_WEIGHT;
  if (raw == null || String(raw).trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 2);
}

/** When true (default), same-slot term is `min(1, sameSlotAssigned / capacity_per_day)` so small teams are not over-penalized. Set `TEAM_ASSIGN_SLOT_LOAD_NORMALIZE_CAPACITY=false` for raw counts. */
function readSlotLoadNormalizeByCapacity(): boolean {
  const v = process.env.TEAM_ASSIGN_SLOT_LOAD_NORMALIZE_CAPACITY;
  if (v == null || String(v).trim() === "") return true;
  const s = String(v).trim().toLowerCase();
  return s !== "false" && s !== "0" && s !== "no" && s !== "off";
}

/** Whole-string `H:MM` / `HH:MM` — must pass before same-slot DB column fetch + weighting. */
function hasValidBookingTimeForSlotWeight(time: string | null | undefined): boolean {
  const raw = String(time ?? "").trim();
  return /^\d{1,2}:\d{1,2}$/.test(raw);
}

/**
 * Deterministic sampling per `bookingId` when rate in (0,1). Env: `TEAM_ASSIGN_CANDIDATE_METRIC_SAMPLE_RATE`
 * (0 = off, 1 = always).
 */
function shouldEmitCandidateMetricSample(bookingId: string): boolean {
  const raw = process.env.TEAM_ASSIGN_CANDIDATE_METRIC_SAMPLE_RATE;
  if (raw == null || String(raw).trim() === "") return false;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n >= 1) return true;
  const u = (hashStringToPositiveInt(`candidateSample|${bookingId}`) % 1_000_000) / 1_000_000;
  return u < n;
}

function buildCandidateSample(candidates: TeamCandidate[]) {
  return candidates.slice(0, 5).map((c) => ({
    id: c.id,
    load: c.assignedJobsToday,
    remaining: teamDayCapacitySlots(c) - c.slotLoadForCapacity,
    roster: c.rosterSnapshot,
  }));
}

function logTeamAssignmentNoCandidates(args: {
  bookingId: string;
  serviceType: string;
  bookingDate: string;
  totalTeams: number;
  noRosterTeamCount: number;
  atCapacityTeamCount: number;
  teamAssignSlotLoadWeight: number;
  slotLoadNormalizeByCapacity: boolean;
  bookingTimeSlotKey: string | null;
  saturationShortCircuit: boolean;
}) {
  void logSystemEvent({
    level: "warn",
    source: "TEAM_ASSIGNMENT_NO_CANDIDATES",
    message: "All teams filtered out (roster or day capacity) for booking date",
    context: {
      bookingId: args.bookingId,
      serviceType: args.serviceType,
      bookingDate: args.bookingDate,
      totalTeams: args.totalTeams,
      filteredOut: args.totalTeams,
      noRosterTeamCount: args.noRosterTeamCount,
      atCapacityTeamCount: args.atCapacityTeamCount,
      teamAssignSlotLoadWeight: args.teamAssignSlotLoadWeight,
      slotLoadNormalizeByCapacity: args.slotLoadNormalizeByCapacity,
      bookingTimeSlotKey: args.bookingTimeSlotKey,
      saturationShortCircuit: args.saturationShortCircuit,
    },
  });
}

type TeamFinalizeOk = {
  ok: true;
  teamId: string;
  claimRpcCallCount: number;
  capacityBackoffCount: number;
};
type TeamFinalizeResult = TeamFinalizeOk | Extract<TeamAssignResult, { ok: false }>;

/** Pre-migration or schema mismatch: do not block team assignment. */
function isMissingTeamSnapshotColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  if (code === "42703") return true;
  const msg = String(err.message ?? "").toLowerCase();
  return (
    msg.includes("team_member_count_snapshot") &&
    (msg.includes("does not exist") || msg.includes("could not find") || msg.includes("schema cache"))
  );
}

/**
 * One round-trip: team job rows on this date for all candidate teams.
 *
 * `slotLoadByTeam` counts team jobs whose status is in {@link CAPACITY_STATUSES} on `dateYmd` — same set
 * you should treat as consuming a team-day slot when reasoning about load. Authoritative enforcement is
 * `public.claim_team_capacity_slot` in `supabase/migrations/20260526_earnings_team_foundation.sql` (via
 * `team_daily_capacity_usage.used_slots`); keep booking lifecycle + usage in sync so this pre-check and
 * the RPC do not drift.
 */
async function fetchTeamBookingAggregates(
  supabase: SupabaseClient,
  teamIds: string[],
  dateYmd: string,
  bookingTimeSlotKey: string | null,
  includeTimeColumn: boolean,
): Promise<{
  assignedByTeam: Map<string, number>;
  slotLoadByTeam: Map<string, number>;
  sameSlotAssignedByTeam: Map<string, number>;
} | null> {
  if (!teamIds.length) {
    return { assignedByTeam: new Map(), slotLoadByTeam: new Map(), sameSlotAssignedByTeam: new Map() };
  }
  const selectCols = includeTimeColumn ? "team_id, status, time" : "team_id, status";
  const { data, error } = await supabase
    .from("bookings")
    .select(selectCols)
    .eq("date", dateYmd)
    .eq("is_team_job", true)
    .in("team_id", teamIds);
  if (error) return null;

  const assignedByTeam = new Map<string, number>();
  const slotLoadByTeam = new Map<string, number>();
  const sameSlotAssignedByTeam = new Map<string, number>();
  for (const raw of data ?? []) {
    const row = raw as { team_id?: string | null; status?: string | null; time?: string | null };
    const tid = String(row.team_id ?? "").trim();
    if (!tid) continue;
    const st = String(row.status ?? "").toLowerCase();
    if (st === "assigned" || st === "in_progress") {
      assignedByTeam.set(tid, (assignedByTeam.get(tid) ?? 0) + 1);
      if (bookingTimeSlotKey && includeTimeColumn) {
        const rowSlot = normalizeBookingTimeSlotKey(row.time);
        if (rowSlot === bookingTimeSlotKey) {
          sameSlotAssignedByTeam.set(tid, (sameSlotAssignedByTeam.get(tid) ?? 0) + 1);
        }
      }
    }
    if (isCapacityConsumingStatus(st)) {
      slotLoadByTeam.set(tid, (slotLoadByTeam.get(tid) ?? 0) + 1);
    }
  }
  return { assignedByTeam, slotLoadByTeam, sameSlotAssignedByTeam };
}

/** One round-trip: roster rows for all teams, then in-memory active counts per team. */
async function fetchTeamRosterSnapshots(
  supabase: SupabaseClient,
  teamIds: string[],
  dateYmd: string,
): Promise<Map<string, number> | null> {
  if (!teamIds.length) return new Map();
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id, cleaner_id, active_from, active_to")
    .in("team_id", teamIds)
    .not("cleaner_id", "is", null);
  if (error) return null;

  const byTeam = new Map<string, { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null }[]>();
  for (const raw of data ?? []) {
    const row = raw as { team_id?: string | null; cleaner_id?: string | null; active_from?: string | null; active_to?: string | null };
    const tid = String(row.team_id ?? "").trim();
    if (!tid) continue;
    if (!byTeam.has(tid)) byTeam.set(tid, []);
    byTeam.get(tid)!.push(row);
  }
  const out = new Map<string, number>();
  for (const tid of teamIds) {
    const members = byTeam.get(tid) ?? [];
    const n = countActiveTeamMembersOnDate(members, dateYmd);
    out.set(tid, n);
  }
  return out;
}

function sortTeamCandidates(
  teams: TeamRow[],
  roster: Map<string, number>,
  agg: {
    assignedByTeam: Map<string, number>;
    slotLoadByTeam: Map<string, number>;
    sameSlotAssignedByTeam: Map<string, number>;
  },
  slotLoadWeight: number,
  slotLoadNormalizeByCapacity: boolean,
): TeamCandidate[] {
  const cap = (t: TeamRow) => teamDayCapacitySlots(t);
  const rows: TeamCandidate[] = [];
  for (const t of teams) {
    const rosterSnapshot = roster.get(t.id) ?? 0;
    if (rosterSnapshot <= 0) continue;
    const assignedJobsToday = agg.assignedByTeam.get(t.id) ?? 0;
    const slotLoadForCapacity = agg.slotLoadByTeam.get(t.id) ?? 0;
    if (slotLoadForCapacity >= cap(t)) continue;
    const sameSlot = agg.sameSlotAssignedByTeam.get(t.id) ?? 0;
    const capVal = cap(t);
    const normalized = Math.min(1, sameSlot / capVal);
    const slotTerm = slotLoadNormalizeByCapacity ? normalized : sameSlot;
    const loadScore = assignedJobsToday + slotLoadWeight * slotTerm;
    rows.push({
      ...t,
      rosterSnapshot,
      assignedJobsToday,
      slotLoadForCapacity,
      loadScore,
    });
  }
  const capacityRemaining = (c: TeamCandidate) => cap(c) - c.slotLoadForCapacity;
  rows.sort((a, b) => {
    if (a.loadScore !== b.loadScore) return a.loadScore - b.loadScore;
    const remA = capacityRemaining(a);
    const remB = capacityRemaining(b);
    if (remA !== remB) return remB - remA;
    if (a.rosterSnapshot !== b.rosterSnapshot) return a.rosterSnapshot - b.rosterSnapshot;
    return a.id.localeCompare(b.id);
  });
  return rows;
}

const TIE_BUCKET_ROTATE_MAX = 50;
const TIE_BUCKET_ROTATE_PREFIX = 20;

/** Rotate within equal (loadScore, remaining capacity, roster) buckets to spread concurrent claim attempts; order between buckets stays strict. */
function tieBucketHashSeed(bookingId: string, dateYmd: string, bucketKey: string): string {
  return `v1|${bookingId}|${dateYmd}|${bucketKey}`;
}

function applyDeterministicTieSpread(candidates: TeamCandidate[], bookingId: string, dateYmd: string): TeamCandidate[] {
  const cap = (t: TeamRow) => teamDayCapacitySlots(t);
  const rem = (c: TeamCandidate) => cap(c) - c.slotLoadForCapacity;
  const out: TeamCandidate[] = [];
  let i = 0;
  while (i < candidates.length) {
    const c0 = candidates[i]!;
    const bucketKey = `${c0.loadScore}|${rem(c0)}|${c0.rosterSnapshot}`;
    let j = i + 1;
    while (j < candidates.length) {
      const cj = candidates[j]!;
      if (`${cj.loadScore}|${rem(cj)}|${cj.rosterSnapshot}` !== bucketKey) break;
      j++;
    }
    const slice = candidates.slice(i, j);
    if (slice.length <= 1) {
      out.push(...slice);
    } else if (slice.length > TIE_BUCKET_ROTATE_MAX) {
      const head = slice.slice(0, TIE_BUCKET_ROTATE_PREFIX);
      const tail = slice.slice(TIE_BUCKET_ROTATE_PREFIX);
      const rot = hashStringToPositiveInt(tieBucketHashSeed(bookingId, dateYmd, bucketKey)) % head.length;
      out.push(...head.slice(rot), ...head.slice(0, rot), ...tail);
    } else {
      const rot = hashStringToPositiveInt(tieBucketHashSeed(bookingId, dateYmd, bucketKey)) % slice.length;
      out.push(...slice.slice(rot), ...slice.slice(0, rot));
    }
    i = j;
  }
  return out;
}

async function finalizeBookingTeamAssignment(
  supabase: SupabaseClient,
  bookingId: string,
  dateYmd: string,
  selected: TeamCandidate,
  serviceType: string,
): Promise<TeamFinalizeResult> {
  const capacity = teamDayCapacitySlots(selected);
  let claimRpcCallCount = 0;
  let capacityBackoffCount = 0;
  let claimedOk = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    claimRpcCallCount++;
    // Capacity truth: `public.claim_team_capacity_slot` (team_daily_capacity_usage) — see 20260526_earnings_team_foundation.sql
    const { data: claimed, error: claimErr } = await supabase.rpc("claim_team_capacity_slot", {
      p_team_id: selected.id,
      p_booking_date: dateYmd,
      p_capacity_per_day: capacity,
    });
    if (claimErr) {
      return { ok: false, error: "db_error", message: claimErr.message };
    }
    if (claimed === true) {
      claimedOk = true;
      break;
    }
    if (attempt === 0) {
      capacityBackoffCount++;
      const ms = 20 + Math.floor(Math.random() * 31);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  if (!claimedOk) {
    return { ok: false, error: "no_candidate", message: "capacity_claim_rejected" };
  }

  const { data: leadRow } = await supabase
    .from("team_members")
    .select("cleaner_id")
    .eq("team_id", selected.id)
    .not("cleaner_id", "is", null)
    .order("cleaner_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  const payoutOwnerCleanerId =
    leadRow && typeof (leadRow as { cleaner_id?: string }).cleaner_id === "string"
      ? String((leadRow as { cleaner_id: string }).cleaner_id).trim()
      : null;

  if (!payoutOwnerCleanerId) {
    await supabase.rpc("release_team_capacity_slot", {
      p_team_id: selected.id,
      p_booking_date: dateYmd,
    });
    const error_id = newTeamAssignmentErrorId();
    void logSystemEvent({
      level: "warn",
      source: "TEAM_PAYOUT_OWNER_UNRESOLVED",
      message: "Team assignment aborted: no payout owner resolved for roster",
      context: {
        error_id,
        booking_id: bookingId,
        team_id: selected.id,
        bookingDate: dateYmd,
        serviceType,
      },
    });
    return {
      ok: false,
      error: "no_candidate",
      message: "team_payout_owner_unresolved",
      code: "team_payout_owner_unresolved",
      booking_id: bookingId,
      team_id: selected.id,
      error_id,
    };
  }

  const nowIso = new Date().toISOString();
  /** Snapshot from the chosen team at assignment time (post-claim), not a stale pre-sort value. */
  const rosterSnapshot = Math.max(0, Math.floor(selected.rosterSnapshot));
  const baseUpdate = {
    cleaner_id: null,
    payout_owner_cleaner_id: payoutOwnerCleanerId,
    is_team_job: true,
    team_id: selected.id,
    status: "assigned" as const,
    dispatch_status: "assigned" as const,
    assigned_at: nowIso,
    cleaner_response_status: CLEANER_RESPONSE.PENDING,
  };

  let upd = await supabase
    .from("bookings")
    .update({
      ...baseUpdate,
      team_member_count_snapshot: rosterSnapshot,
    })
    .eq("id", bookingId)
    .eq("status", "pending")
    .is("cleaner_id", null)
    .select("id")
    .maybeSingle();

  if (upd.error && isMissingTeamSnapshotColumnError(upd.error)) {
    void logSystemEvent({
      level: "warn",
      source: "TEAM_SNAPSHOT_WRITE_FAILED",
      message: "team_member_count_snapshot not writable; continuing assignment without snapshot",
      context: {
        bookingId,
        teamId: selected.id,
        pgCode: upd.error.code ?? null,
        detail: upd.error.message ?? null,
      },
    });
    upd = await supabase
      .from("bookings")
      .update({ ...baseUpdate })
      .eq("id", bookingId)
      .eq("status", "pending")
      .is("cleaner_id", null)
      .select("id")
      .maybeSingle();
  }

  const { data: updated, error: uErr } = upd;
  if (uErr || !updated) {
    await supabase.rpc("release_team_capacity_slot", {
      p_team_id: selected.id,
      p_booking_date: dateYmd,
    });
    if (uErr) return { ok: false, error: "db_error", message: uErr.message };
    return { ok: false, error: "booking_not_pending", message: "booking_update_failed" };
  }

  const { error: insErr } = await supabase.from("booking_team_assignments").insert({
    booking_id: bookingId,
    team_id: selected.id,
    status: "assigned",
    assigned_at: nowIso,
  });
  if (insErr) {
    await supabase.rpc("release_team_capacity_slot", {
      p_team_id: selected.id,
      p_booking_date: dateYmd,
    });
    return { ok: false, error: "db_error", message: insErr.message };
  }

  void logSystemEvent({
    level: "info",
    source: "TEAM_ASSIGNMENT_SUCCESS",
    message: "Team assigned to booking",
    context: {
      bookingId,
      teamId: selected.id,
      bookingDate: dateYmd,
      serviceType,
      claimRpcCallCount,
      capacityBackoffCount,
    },
  });

  return { ok: true, teamId: selected.id, claimRpcCallCount, capacityBackoffCount };
}

/**
 * Assigns a team using least-loaded ordering, optional same-slot weighting (`TEAM_ASSIGN_SLOT_LOAD_WEIGHT`, clamped 0–2),
 * and atomic `claim_team_capacity_slot`.
 *
 * **Log aggregation** (`TEAM_ASSIGNMENT_ALLOCATION_METRIC`, `metricSchemaVersion: 3`): derive `assignment_success_rate`,
 * `fallback_rate`, `avg_attempts_per_assignment` (mean of `attemptCount`), `avg_selected_team_rank` (mean of `selectedTeamRank`, 0-based),
 * `capacity_reject_rate`, and `p95_assignment_latency_ms` from `outcome`, `attemptCount`, `selectedTeamRank`, `selectedTeamId`,
 * `fallbackUsed`, `capacityRejectTryCount`, `claimRpcCallCount`, and `assignmentDurationMs` over a window.
 */
export async function assignTeamToBooking(
  supabase: SupabaseClient,
  booking: {
    id: string;
    status: string | null;
    cleaner_id: string | null;
    date: string | null;
    /** Used for optional same-timeslot load when `TEAM_ASSIGN_SLOT_LOAD_WEIGHT` is set. */
    time?: string | null;
  },
  serviceType: "deep_cleaning" | "move_cleaning",
): Promise<TeamAssignResult> {
  const st = String(booking.status ?? "").toLowerCase();
  if (st !== "pending" || booking.cleaner_id) {
    void logSystemEvent({
      level: "warn",
      source: "TEAM_ASSIGNMENT_FAILED",
      message: "Booking must be pending and unassigned for team assignment",
      context: { bookingId: booking.id, status: booking.status, cleanerId: booking.cleaner_id },
    });
    return { ok: false, error: "booking_not_pending", message: "Booking must be pending and unassigned." };
  }
  const dateYmd = String(booking.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    void logSystemEvent({
      level: "error",
      source: "TEAM_ASSIGNMENT_FAILED",
      message: "Booking date missing for team assignment",
      context: { bookingId: booking.id, bookingDate: booking.date },
    });
    return { ok: false, error: "db_error", message: "Booking date missing for team capacity check." };
  }

  const tAllocStart = performance.now();

  const { data: teams, error: tErr } = await supabase
    .from("teams")
    .select("id, capacity_per_day")
    .eq("is_active", true)
    .eq("service_type", serviceType)
    .order("created_at", { ascending: true })
    .limit(50);
  if (tErr) return { ok: false, error: "db_error", message: tErr.message };
  if (!teams?.length) {
    void logSystemEvent({
      level: "warn",
      source: "TEAM_ASSIGNMENT_FAILED",
      message: "No active teams available",
      context: { bookingId: booking.id, serviceType },
    });
    return { ok: false, error: "no_candidate", message: "No team available" };
  }

  const teamRows = teams as TeamRow[];
  const teamIds = teamRows.map((t) => t.id);
  const slotLoadWeight = readTeamAssignSlotLoadWeight();
  const useSlotWeight = slotLoadWeight > 0 && hasValidBookingTimeForSlotWeight(booking.time);
  const effectiveSlotWeight = useSlotWeight ? slotLoadWeight : 0;
  const slotLoadNormalizeByCapacity = readSlotLoadNormalizeByCapacity();
  const includeBookingTimeInAgg = useSlotWeight;
  const bookingTimeSlotKey = useSlotWeight ? normalizeBookingTimeSlotKey(booking.time) : null;

  const [agg, roster] = await Promise.all([
    fetchTeamBookingAggregates(supabase, teamIds, dateYmd, bookingTimeSlotKey, includeBookingTimeInAgg),
    fetchTeamRosterSnapshots(supabase, teamIds, dateYmd),
  ]);
  if (!agg || !roster) {
    return { ok: false, error: "db_error", message: "Could not load team assignment data." };
  }

  const noRosterTeamCount = teamRows.filter((t) => (roster.get(t.id) ?? 0) <= 0).length;
  const teamsWithRoster = teamRows.filter((t) => (roster.get(t.id) ?? 0) > 0);
  const atCapacityTeamCount = teamsWithRoster.filter((t) => {
    const slot = agg.slotLoadByTeam.get(t.id) ?? 0;
    return slot >= teamDayCapacitySlots(t);
  }).length;

  if (teamsWithRoster.length > 0 && atCapacityTeamCount === teamsWithRoster.length) {
    logTeamAssignmentNoCandidates({
      bookingId: booking.id,
      serviceType,
      bookingDate: dateYmd,
      totalTeams: teamRows.length,
      noRosterTeamCount,
      atCapacityTeamCount,
      teamAssignSlotLoadWeight: slotLoadWeight,
      slotLoadNormalizeByCapacity,
      bookingTimeSlotKey,
      saturationShortCircuit: true,
    });
    return { ok: false, error: "no_candidate", message: "Team capacity exceeded" };
  }

  const sorted = sortTeamCandidates(teamRows, roster, agg, effectiveSlotWeight, slotLoadNormalizeByCapacity);
  const candidates = applyDeterministicTieSpread(sorted, booking.id, dateYmd);
  if (!candidates.length) {
    const hasAnyRoster = teamIds.some((id) => (roster.get(id) ?? 0) > 0);
    if (!hasAnyRoster) {
      void logSystemEvent({
        level: "warn",
        source: "TEAM_ASSIGNMENT_FAILED",
        message: "No active team members for selected service",
        context: { bookingId: booking.id, serviceType, bookingDate: dateYmd },
      });
      return { ok: false, error: "no_candidate", message: "No active team members" };
    }
    logTeamAssignmentNoCandidates({
      bookingId: booking.id,
      serviceType,
      bookingDate: dateYmd,
      totalTeams: teamRows.length,
      noRosterTeamCount,
      atCapacityTeamCount,
      teamAssignSlotLoadWeight: slotLoadWeight,
      slotLoadNormalizeByCapacity,
      bookingTimeSlotKey,
      saturationShortCircuit: false,
    });
    return { ok: false, error: "no_candidate", message: "Team capacity exceeded" };
  }

  const MAX_INTER_TEAM_BACKOFF_TOTAL_MS = 200;

  const failedTeamIds: string[] = [];
  let lastFailureReason = "";
  let capacityRejectTryCount = 0;
  let interTeamBackoffMsTotal = 0;
  const exhaustedFailureKinds = new Set<"capacity" | "update" | "other">();

  for (let i = 0; i < candidates.length; i++) {
    const team = candidates[i]!;
    if (failedTeamIds.length >= 2 && interTeamBackoffMsTotal < MAX_INTER_TEAM_BACKOFF_TOTAL_MS) {
      const jitter = 40 + Math.floor(Math.random() * 41);
      const budget = MAX_INTER_TEAM_BACKOFF_TOTAL_MS - interTeamBackoffMsTotal;
      const sleepMs = Math.min(jitter, Math.max(0, budget));
      if (sleepMs > 0) {
        interTeamBackoffMsTotal += sleepMs;
        await new Promise((r) => setTimeout(r, sleepMs));
      }
    }
    const r = await finalizeBookingTeamAssignment(supabase, booking.id, dateYmd, team, serviceType);
    if (!r.ok && r.code === "team_payout_owner_unresolved") {
      return {
        ok: false,
        error: "no_candidate",
        message: r.message,
        code: r.code,
        booking_id: r.booking_id ?? booking.id,
        team_id: r.team_id ?? team.id,
        error_id: r.error_id,
      };
    }
    if (r.ok) {
      if (failedTeamIds.length > 0) {
        void logSystemEvent({
          level: "info",
          source: "TEAM_ASSIGNMENT_FALLBACK",
          message: "Selected team after earlier candidate(s) could not be assigned",
          context: {
            bookingId: booking.id,
            bookingDate: dateYmd,
            serviceType,
            attemptedTeams: failedTeamIds,
            selectedTeam: team.id,
            reason: lastFailureReason || "prior_team_failed",
          },
        });
      }
      const attemptCount = i + 1;
      const includeCandidateSample = shouldEmitCandidateMetricSample(booking.id);
      void logSystemEvent({
        level: "info",
        source: "TEAM_ASSIGNMENT_ALLOCATION_METRIC",
        message: "Team allocation outcome",
        context: {
          metricSchemaVersion: 3,
          outcome: "success",
          bookingId: booking.id,
          bookingDate: dateYmd,
          serviceType,
          candidateCount: candidates.length,
          attemptIndex: attemptCount,
          attemptCount,
          selectedTeamRank: i,
          selectedTeamId: team.id,
          fallbackUsed: failedTeamIds.length > 0,
          claimRpcCallCount: r.claimRpcCallCount,
          capacityBackoffCount: r.capacityBackoffCount,
          capacityRejectTryCount,
          interTeamBackoffMsTotal,
          assignmentDurationMs: Math.round(performance.now() - tAllocStart),
          teamAssignSlotLoadWeight: slotLoadWeight,
          slotLoadNormalizeByCapacity,
          bookingTimeSlotKey,
          ...(includeCandidateSample ? { candidateSample: buildCandidateSample(candidates) } : {}),
        },
      });
      return { ok: true, teamId: r.teamId };
    }

    failedTeamIds.push(team.id);
    if (r.message === "capacity_claim_rejected") {
      exhaustedFailureKinds.add("capacity");
      capacityRejectTryCount++;
      lastFailureReason = "capacity_claim_rejected";
      void logSystemEvent({
        level: "info",
        source: "TEAM_CAPACITY_REJECTED",
        message: "Atomic capacity claim rejected",
        context: { bookingId: booking.id, teamId: team.id, bookingDate: dateYmd },
      });
    } else if (r.message === "booking_update_failed") {
      exhaustedFailureKinds.add("update");
      lastFailureReason = "booking_update_failed";
    } else if (r.error === "db_error") {
      exhaustedFailureKinds.add("other");
      lastFailureReason = r.message ?? "db_error";
    } else {
      exhaustedFailureKinds.add("other");
      lastFailureReason = r.message ?? r.error;
    }

    if (r.error === "db_error" && r.message !== "capacity_claim_rejected" && r.message !== "booking_update_failed") {
      return r;
    }
  }

  void logSystemEvent({
    level: "warn",
    source: "TEAM_ASSIGNMENT_FAILED",
    message: "All candidate teams exhausted without assignment",
    context: {
      bookingId: booking.id,
      bookingDate: dateYmd,
      serviceType,
      attemptedTeams: failedTeamIds,
      reason: lastFailureReason || "all_candidates_failed",
    },
  });

  const exhaustedReason: "all_capacity_rejected" | "update_failures" | "mixed" =
    exhaustedFailureKinds.has("other") || (exhaustedFailureKinds.has("capacity") && exhaustedFailureKinds.has("update"))
      ? "mixed"
      : exhaustedFailureKinds.has("update")
        ? "update_failures"
        : "all_capacity_rejected";

  const exhaustedAttemptCount = candidates.length;
  const includeExhaustedCandidateSample = shouldEmitCandidateMetricSample(booking.id);
  void logSystemEvent({
    level: "warn",
    source: "TEAM_ASSIGNMENT_ALLOCATION_METRIC",
    message: "Team allocation outcome",
    context: {
      metricSchemaVersion: 3,
      outcome: "exhausted",
      exhaustedReason,
      bookingId: booking.id,
      bookingDate: dateYmd,
      serviceType,
      candidateCount: candidates.length,
      attemptIndex: exhaustedAttemptCount,
      attemptCount: exhaustedAttemptCount,
      selectedTeamRank: null,
      selectedTeamId: null,
      fallbackUsed: failedTeamIds.length > 0,
      attemptedTeams: failedTeamIds,
      capacityRejectTryCount,
      interTeamBackoffMsTotal,
      assignmentDurationMs: Math.round(performance.now() - tAllocStart),
      teamAssignSlotLoadWeight: slotLoadWeight,
      slotLoadNormalizeByCapacity,
      bookingTimeSlotKey,
      ...(includeExhaustedCandidateSample ? { candidateSample: buildCandidateSample(candidates) } : {}),
    },
  });

  const hasAnyRoster = teamIds.some((id) => (roster.get(id) ?? 0) > 0);
  if (!hasAnyRoster) {
    return { ok: false, error: "no_candidate", message: "No active team members" };
  }
  return { ok: false, error: "no_candidate", message: "Team capacity exceeded" };
}
