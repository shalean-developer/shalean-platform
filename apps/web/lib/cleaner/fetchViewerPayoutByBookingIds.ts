import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchViewerPayoutByBookingIds(
  admin: SupabaseClient,
  cleanerId: string,
  bookingIds: readonly string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(bookingIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const out = new Map<string, number>();
  if (!cleanerId || ids.length === 0) return out;

  // Keep PostgREST URLs bounded even when open assignments span a large backlog.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batchIds = ids.slice(offset, offset + 100);
    const [team, roster] = await Promise.all([
      admin
        .from("team_job_member_payouts")
        .select("booking_id, payout_cents")
        .eq("cleaner_id", cleanerId)
        .in("booking_id", batchIds),
      admin
        .from("booking_roster_member_payouts")
        .select("booking_id, payout_cents, bonus_cents")
        .eq("cleaner_id", cleanerId)
        .in("booking_id", batchIds),
    ]);

    if (team.error) throw new Error(team.error.message);
    if (roster.error) throw new Error(roster.error.message);

    // Formal team rows are the highest-rank member payout rail.
    for (const raw of team.data ?? []) {
      const row = raw as { booking_id?: string | null; payout_cents?: number | null };
      const bookingId = String(row.booking_id ?? "").trim();
      const cents = Number(row.payout_cents);
      if (bookingId && Number.isFinite(cents)) {
        out.set(bookingId, Math.max(0, Math.round(cents)));
      }
    }

    // Paired-roster rows apply only when no formal-team override exists.
    for (const raw of roster.data ?? []) {
      const row = raw as {
        booking_id?: string | null;
        payout_cents?: number | null;
        bonus_cents?: number | null;
      };
      const bookingId = String(row.booking_id ?? "").trim();
      if (!bookingId || out.has(bookingId)) continue;
      const payout = Number(row.payout_cents);
      const bonus = Number(row.bonus_cents);
      const total =
        (Number.isFinite(payout) ? Math.max(0, Math.round(payout)) : 0) +
        (Number.isFinite(bonus) ? Math.max(0, Math.round(bonus)) : 0);
      out.set(bookingId, total);
    }
  }

  return out;
}
