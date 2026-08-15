import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isTeamMemberActiveOnBookingDate,
  type TeamMemberAvailabilityRow,
} from "@/lib/cleaner/teamMemberAvailability";

/**
 * Active `team_members.cleaner_id` values for `teamId` at the booking appointment instant
 * (same window semantics as `persistCleanerPayoutIfUnset` team block).
 */
export async function fetchActiveTeamMemberIdsAtAppointment(
  admin: SupabaseClient,
  teamId: string,
  bookingAppointmentIso: string,
): Promise<string[]> {
  const tid = String(teamId ?? "").trim();
  if (!tid) return [];

  const { data: members, error: membersErr } = await admin
    .from("team_members")
    .select("cleaner_id, active_from, active_to")
    .eq("team_id", tid)
    .not("cleaner_id", "is", null);
  if (membersErr) return [];

  const bookingMs = new Date(bookingAppointmentIso).getTime();
  if (Number.isNaN(bookingMs)) return [];

  const active = (members ?? [])
    .map((m) => m as { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null })
    .filter((m) => {
      const cid = String(m.cleaner_id ?? "").trim();
      if (!cid) return false;
      const from = m.active_from ? new Date(m.active_from).getTime() : null;
      const to = m.active_to ? new Date(m.active_to).getTime() : null;
      if (from != null && !Number.isNaN(from) && bookingMs < from) return false;
      if (to != null && !Number.isNaN(to) && bookingMs > to) return false;
      return true;
    });

  return [...new Set(active.map((m) => String(m.cleaner_id ?? "").trim()).filter(Boolean))];
}

/** Active team members for roster/payout using {@link effectiveTeamMembershipDateYmd}. */
export async function fetchActiveTeamMemberIdsForMembershipDate(
  admin: SupabaseClient,
  teamId: string,
  membershipDateYmd: string,
): Promise<string[]> {
  const tid = String(teamId ?? "").trim();
  const d = String(membershipDateYmd ?? "").trim().slice(0, 10);
  if (!tid || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];

  const { data: members, error: membersErr } = await admin
    .from("team_members")
    .select("cleaner_id, active_from, active_to")
    .eq("team_id", tid)
    .not("cleaner_id", "is", null);
  if (membersErr) return [];

  return [
    ...new Set(
      (members ?? [])
        .filter((m) =>
          isTeamMemberActiveOnBookingDate(m as TeamMemberAvailabilityRow, d) &&
          String((m as { cleaner_id?: string | null }).cleaner_id ?? "").trim(),
        )
        .map((m) => String((m as { cleaner_id: string }).cleaner_id).trim()),
    ),
  ];
}

/**
 * Cleaner ids that participate in team payout for a booking.
 * When `booking_cleaners` rows exist they are authoritative (the cleaners who worked that booking);
 * only when no valid booking roster exists do we fall back to active `team_members`.
 */
export function resolveTeamPayoutParticipantIds(params: {
  rosterRows: readonly { cleaner_id?: string | null }[];
  activeTeamMemberIds: readonly string[];
}): string[] {
  const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(String(s ?? "").trim());
  const fromRoster = [
    ...new Set(
      params.rosterRows
        .map((r) => String(r.cleaner_id ?? "").trim())
        .filter((id) => uuid(id)),
    ),
  ];
  if (fromRoster.length > 0) return fromRoster;

  return [
    ...new Set(
      params.activeTeamMemberIds
        .map((c) => String(c ?? "").trim())
        .filter(uuid),
    ),
  ];
}

import type { BookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";

/** Canonical per-cleaner payout for team bookings (ZAR minor units). Same as fixed-special solo rate. */
export const TEAM_PER_CLEANER_PAYOUT_CENTS = 25_000;

export type BookingCleanerRosterRow = {
  cleaner_id: string;
  role?: string | null;
  payout_weight?: number | string | null;
  lead_bonus_cents?: number | string | null;
};

/**
 * Sum of `team_job_member_payouts.payout_cents` for the booking when rows exist; otherwise an estimate
 * from `display_earnings_cents` × `team_member_count_snapshot` (per-cleaner display × headcount).
 */
export async function resolveTeamCleanerPoolCents(admin: SupabaseClient, bookingId: string): Promise<number> {
  const { data: rows, error: pErr } = await admin
    .from("team_job_member_payouts")
    .select("payout_cents")
    .eq("booking_id", bookingId);
  if (!pErr && rows?.length) {
    let s = 0;
    for (const raw of rows) {
      const c = Number((raw as { payout_cents?: number | null }).payout_cents);
      if (Number.isFinite(c) && c > 0) s += Math.floor(c);
    }
    if (s > 0) return s;
  }

  const { data: b, error } = await admin
    .from("bookings")
    .select("cleaner_earnings_total_cents, display_earnings_cents, cleaner_payout_cents, team_member_count_snapshot")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) return 0;

  const row = b as {
    cleaner_earnings_total_cents?: number | null;
    display_earnings_cents?: number | null;
    cleaner_payout_cents?: number | null;
    team_member_count_snapshot?: number | null;
  };

  const total = Number(row.cleaner_earnings_total_cents);
  if (Number.isFinite(total) && total > 0) return Math.floor(total);

  const { data: lines, error: lErr } = await admin
    .from("booking_line_items")
    .select("cleaner_earnings_cents, earns_cleaner")
    .eq("booking_id", bookingId);
  if (!lErr && lines?.length) {
    let sum = 0;
    for (const raw of lines) {
      const li = raw as { cleaner_earnings_cents?: number | null; earns_cleaner?: boolean | null };
      if (li.earns_cleaner === false) continue;
      const c = Number(li.cleaner_earnings_cents);
      if (Number.isFinite(c) && c > 0) sum += Math.floor(c);
    }
    if (sum > 0) return sum;
  }

  const disp = Number(row.display_earnings_cents);
  const snap = Number(row.team_member_count_snapshot);
  const headcount = Number.isFinite(snap) && snap > 0 ? Math.floor(snap) : 1;
  if (Number.isFinite(disp) && disp > 0) return Math.floor(disp) * headcount;

  const leg = Number(row.cleaner_payout_cents);
  if (Number.isFinite(leg) && leg > 0) return Math.floor(leg);
  return 0;
}

/**
 * Weighted split of `totalPoolCents` across roster rows (legacy `USE_LEGACY_PAYOUT_ENGINE` team pool only).
 */
export function allocateTeamMemberPayoutCentsFromRoster(
  totalPoolCents: number,
  roster: readonly BookingCleanerRosterRow[],
): Map<string, number> {
  const out = new Map<string, number>();
  const cleaned = roster
    .map((r) => ({
      cleaner_id: String(r.cleaner_id ?? "").trim(),
      role: String(r.role ?? "").toLowerCase(),
      payout_weight: Math.max(0, Number(r.payout_weight ?? 1) || 0) || 1,
      lead_bonus_cents: Math.max(0, Math.floor(Number(r.lead_bonus_cents ?? 0) || 0)),
    }))
    .filter((r) => /^[0-9a-f-]{36}$/i.test(r.cleaner_id));

  if (cleaned.length === 0) return out;

  const pool = Math.max(0, Math.floor(totalPoolCents));
  if (pool <= 0) {
    for (const r of cleaned) out.set(r.cleaner_id, 0);
    return out;
  }

  const lead = cleaned.find((r) => r.role === "lead") ?? cleaned[0]!;
  let bonus = lead.lead_bonus_cents;
  if (bonus >= pool) bonus = Math.max(0, pool - 1);
  const allocPool = pool - bonus;
  const sumW = cleaned.reduce((s, r) => s + r.payout_weight, 0) || 1;

  let allocated = 0;
  for (const r of cleaned) {
    const c = Math.floor((allocPool * r.payout_weight) / sumW);
    out.set(r.cleaner_id, c);
    allocated += c;
  }
  const remainder = allocPool - allocated;
  const leadId = lead.cleaner_id;
  out.set(leadId, (out.get(leadId) ?? 0) + remainder + bonus);

  let sum = 0;
  for (const v of out.values()) sum += v;
  if (sum > pool) {
    const scale = pool / sum;
    let rounded = 0;
    const ids = [...out.keys()];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const v = out.get(id) ?? 0;
      const adj = i === ids.length - 1 ? pool - rounded : Math.floor(v * scale);
      out.set(id, Math.max(0, adj));
      rounded += out.get(id) ?? 0;
    }
  }
  return out;
}

/** Equal split across cleaner ids (legacy pool when roster not yet materialized). */
export function allocateTeamMemberPayoutCentsEqualSplit(totalPoolCents: number, cleanerIds: readonly string[]): Map<string, number> {
  const ids = [...new Set(cleanerIds.map((c) => String(c ?? "").trim()).filter((c) => /^[0-9a-f-]{36}$/i.test(c)))];
  const out = new Map<string, number>();
  const pool = Math.max(0, Math.floor(totalPoolCents));
  if (ids.length === 0 || pool <= 0) return out;
  const base = Math.floor(pool / ids.length);
  let rem = pool - base * ids.length;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    out.set(id, base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem--;
  }
  return out;
}

/** @deprecated Legacy shared-pool inserts; use {@link buildTeamJobMemberFixedPerCleanerPayoutRows} for canonical team policy. */
export function buildTeamJobMemberPayoutInsertRows(params: {
  bookingId: string;
  teamId: string;
  poolCents: number;
  rosterRows: readonly BookingCleanerRosterRow[];
  fallbackCleanerIds: readonly string[];
}): Array<{ booking_id: string; team_id: string; cleaner_id: string; payout_cents: number; status: string }> {
  const { bookingId, teamId, poolCents, rosterRows, fallbackCleanerIds } = params;
  const map =
    rosterRows.length > 0
      ? allocateTeamMemberPayoutCentsFromRoster(poolCents, rosterRows)
      : allocateTeamMemberPayoutCentsEqualSplit(poolCents, fallbackCleanerIds);

  const rows: Array<{ booking_id: string; team_id: string; cleaner_id: string; payout_cents: number; status: string }> = [];
  for (const [cleaner_id, payout_cents] of map) {
    rows.push({
      booking_id: bookingId,
      team_id: teamId,
      cleaner_id,
      payout_cents: Math.max(0, Math.floor(payout_cents)),
      status: "pending",
    });
  }
  return rows;
}

/**
 * v3 team policy: per-cleaner totals from persisted {@link BookingEarningsSummary}.
 */
export function buildTeamJobMemberPayoutRowsFromEarningsSummary(params: {
  bookingId: string;
  teamId: string;
  summary: BookingEarningsSummary;
}): Array<{ booking_id: string; team_id: string; cleaner_id: string; payout_cents: number; status: string }> {
  const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(String(s ?? "").trim());
  return params.summary.per_cleaner_earnings
    .filter((row) => uuid(row.cleaner_id))
    .map((row) => ({
      booking_id: params.bookingId,
      team_id: params.teamId,
      cleaner_id: row.cleaner_id,
      payout_cents: Math.max(0, Math.floor(row.total_cents)),
      status: "pending",
    }));
}

/**
 * Canonical team policy: **each** roster cleaner (or fallback active team members) receives
 * {@link TEAM_PER_CLEANER_PAYOUT_CENTS} — no weighting, no shared pool.
 * @deprecated Prefer {@link buildTeamJobMemberPayoutRowsFromEarningsSummary} for v3 rules.
 */
export function buildTeamJobMemberFixedPerCleanerPayoutRows(params: {
  bookingId: string;
  teamId: string;
  /** Defaults to {@link TEAM_PER_CLEANER_PAYOUT_CENTS}. */
  perCleanerCents?: number;
  rosterRows: readonly { cleaner_id: string }[];
  fallbackCleanerIds: readonly string[];
}): Array<{ booking_id: string; team_id: string; cleaner_id: string; payout_cents: number; status: string }> {
  const cents = Math.max(0, Math.floor(params.perCleanerCents ?? TEAM_PER_CLEANER_PAYOUT_CENTS));
  const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(String(s ?? "").trim());
  const fromRoster = params.rosterRows
    .map((r) => String(r.cleaner_id ?? "").trim())
    .filter((id) => uuid(id));
  const ids = [...new Set(fromRoster.length > 0 ? fromRoster : params.fallbackCleanerIds.map((c) => String(c).trim()).filter(uuid))];

  return ids.map((cleaner_id) => ({
    booking_id: params.bookingId,
    team_id: params.teamId,
    cleaner_id,
    payout_cents: cents,
    status: "pending",
  }));
}
