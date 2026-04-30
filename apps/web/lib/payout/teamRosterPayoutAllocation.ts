import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingCleanerRosterRow = {
  cleaner_id: string;
  role?: string | null;
  payout_weight?: number | string | null;
  lead_bonus_cents?: number | string | null;
};

/**
 * Canonical cleaner-earnings pool for a booking (cents), aligned with line items when present.
 * Order: finalized `cleaner_earnings_total_cents` → sum of line `cleaner_earnings_cents` (eligible lines)
 * → `display_earnings_cents` → legacy `cleaner_payout_cents`.
 */
export async function resolveTeamCleanerPoolCents(admin: SupabaseClient, bookingId: string): Promise<number> {
  const { data: b, error } = await admin
    .from("bookings")
    .select("cleaner_earnings_total_cents, display_earnings_cents, cleaner_payout_cents")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) return 0;

  const row = b as {
    cleaner_earnings_total_cents?: number | null;
    display_earnings_cents?: number | null;
    cleaner_payout_cents?: number | null;
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
  if (Number.isFinite(disp) && disp > 0) return Math.floor(disp);
  const leg = Number(row.cleaner_payout_cents);
  if (Number.isFinite(leg) && leg > 0) return Math.floor(leg);
  return 0;
}

/**
 * Weighted split of `totalPoolCents` across roster rows, then remainder + `lead_bonus_cents` to the lead.
 * Sum of returned cents equals `totalPoolCents` when pool > 0 and roster non-empty.
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

/** Equal split across cleaner ids (when roster not yet materialized). */
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
