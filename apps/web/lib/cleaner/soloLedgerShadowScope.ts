import type { SupabaseClient } from "@supabase/supabase-js";

/** Read the same distinct roster scope as the ledger writers; never infer solo on a read failure. */
export async function fetchMemberRailBookingIds(
  admin: SupabaseClient,
  bookings: readonly { id: string; is_team_job?: boolean | null }[],
): Promise<Set<string>> {
  const excluded = new Set(bookings.filter(b => b.is_team_job === true).map(b => b.id));
  const ids = [...new Set(bookings.filter(b => b.is_team_job !== true).map(b => b.id))];
  for (let i = 0; i < ids.length; i += 100) {
    const participants = new Map<string, Set<string>>();
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from("booking_cleaners")
        .select("id, booking_id, cleaner_id").in("booking_id", ids.slice(i, i + 100))
        .order("id", { ascending: true }).range(offset, offset + 499);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const bid = String(row.booking_id ?? "").trim();
        const cid = String(row.cleaner_id ?? "").trim();
        if (!bid || !cid) continue;
        const members = participants.get(bid) ?? new Set<string>();
        members.add(cid);
        participants.set(bid, members);
      }
      if ((data ?? []).length < 500) break;
    }
    for (const [bid, members] of participants) if (members.size >= 2) excluded.add(bid);
  }
  return excluded;
}
