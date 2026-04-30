import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamRosterMemberWire = {
  cleaner_id: string;
  full_name: string | null;
  role: string;
};

/**
 * Loads `booking_cleaners` for many bookings and resolves `cleaners.full_name`.
 */
export async function fetchTeamRosterByBookingIds(
  admin: SupabaseClient,
  bookingIds: readonly string[],
): Promise<Map<string, TeamRosterMemberWire[]>> {
  const out = new Map<string, TeamRosterMemberWire[]>();
  const ids = [...new Set(bookingIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!ids.length) return out;

  const { data: bcRows, error: bcErr } = await admin
    .from("booking_cleaners")
    .select("booking_id, cleaner_id, role")
    .in("booking_id", ids)
    .order("role", { ascending: true })
    .order("cleaner_id", { ascending: true });
  if (bcErr || !bcRows?.length) return out;

  const cleanerIds = [
    ...new Set(
      (bcRows as { cleaner_id?: string | null }[])
        .map((r) => String(r.cleaner_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const names = new Map<string, string | null>();
  if (cleanerIds.length > 0) {
    const { data: clRows } = await admin.from("cleaners").select("id, full_name").in("id", cleanerIds);
    for (const c of clRows ?? []) {
      const row = c as { id?: string; full_name?: string | null };
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      names.set(id, row.full_name?.trim() ? row.full_name.trim() : null);
    }
  }

  for (const raw of bcRows as { booking_id?: string; cleaner_id?: string; role?: string }[]) {
    const bid = String(raw.booking_id ?? "").trim();
    const cid = String(raw.cleaner_id ?? "").trim();
    if (!bid || !cid) continue;
    const role = String(raw.role ?? "member").toLowerCase() === "lead" ? "lead" : "member";
    const list = out.get(bid) ?? [];
    list.push({
      cleaner_id: cid,
      full_name: names.get(cid) ?? null,
      role,
    });
    out.set(bid, list);
  }
  return out;
}

/** One-line hint for job cards: other cleaners on the roster (excludes viewer). */
export function teamRosterPeersSummary(roster: readonly TeamRosterMemberWire[], viewerCleanerId: string): string | null {
  const vid = viewerCleanerId.trim();
  const others = roster.filter((m) => m.cleaner_id !== vid);
  if (others.length === 0) return null;
  const labels = others.map((m) => (m.full_name?.trim() ? m.full_name.trim() : "Teammate"));
  const head = labels.slice(0, 2).join(", ");
  const more = labels.length > 2 ? ` +${labels.length - 2} more` : "";
  return `${head}${more}`;
}
