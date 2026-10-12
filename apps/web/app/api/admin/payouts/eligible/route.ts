import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  loadRosterByBookingIds,
  loadTeamJobMemberPayoutsByBookingIds,
  perCleanerAllocationsForBooking,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingEligibleRow = {
  id: string;
  date: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  payout_frozen_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_earnings_total_cents: number | null;
  cleaner_payout_cents: number | null;
  is_team_job: boolean | null;
  earnings_summary?: unknown;
  metadata?: unknown;
};

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: rows, error } = await admin
    .from("bookings")
    .select(
      "id, date, cleaner_id, payout_owner_cleaner_id, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, is_team_job, earnings_summary, metadata",
    )
    .eq("payout_status", "eligible")
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (rows ?? []) as BookingEligibleRow[];
  const bookingIds = list.map((row) => row.id).filter(Boolean);
  const [rosterByBooking, teamPayoutsByBooking] = await Promise.all([
    loadRosterByBookingIds(admin, bookingIds),
    loadTeamJobMemberPayoutsByBookingIds(admin, bookingIds),
  ]);

  const allocationsByBooking = new Map<
    string,
    ReturnType<typeof perCleanerAllocationsForBooking>
  >();
  const cleanerIdSet = new Set<string>();
  for (const booking of list) {
    const allocations = perCleanerAllocationsForBooking(
      booking,
      rosterByBooking.get(booking.id) ?? [],
      teamPayoutsByBooking.get(booking.id),
    );
    allocationsByBooking.set(booking.id, allocations);
    for (const allocation of allocations) {
      if (allocation.cleaner_id) cleanerIdSet.add(allocation.cleaner_id);
    }
  }
  const cleanerIds = [...cleanerIdSet];

  const cleanersById = new Map<string, { full_name: string | null; phone: string | null }>();
  if (cleanerIds.length > 0) {
    const { data: cleaners, error: cErr } = await admin
      .from("cleaners")
      .select("id, full_name, phone, phone_number")
      .in("id", cleanerIds);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    for (const c of cleaners ?? []) {
      const rec = c as { id?: string; full_name?: string | null; phone?: string | null; phone_number?: string | null };
      const id = String(rec.id ?? "").trim();
      if (!id) continue;
      const phone = String(rec.phone_number ?? rec.phone ?? "")
        .trim()
        .slice(0, 32);
      cleanersById.set(id, { full_name: rec.full_name ?? null, phone: phone || null });
    }
  }

  const byCleaner = new Map<
    string,
    { cleaner_id: string; cleaner_name: string; cleaner_phone: string; total_cents: number; bookings: { booking_id: string; date: string | null; amount_cents: number }[] }
  >();

  for (const booking of list) {
    const allocations = allocationsByBooking.get(booking.id) ?? [];
    for (const allocation of allocations) {
      const cid = allocation.cleaner_id;
      if (!cid) continue;
      const cents = Math.max(0, Math.round(Number(allocation.cents) || 0));
      const meta = cleanersById.get(cid);
      const name = meta?.full_name?.trim() || "Cleaner";
      const phone = meta?.phone?.trim() || "";
      if (!byCleaner.has(cid)) {
        byCleaner.set(cid, {
          cleaner_id: cid,
          cleaner_name: name,
          cleaner_phone: phone,
          total_cents: 0,
          bookings: [],
        });
      }
      const group = byCleaner.get(cid)!;
      group.bookings.push({
        booking_id: booking.id,
        date: booking.date,
        amount_cents: cents,
      });
      group.total_cents += cents;
    }
  }

  const grouped = [...byCleaner.values()].sort((a, b) => b.total_cents - a.total_cents || a.cleaner_name.localeCompare(b.cleaner_name));

  return NextResponse.json({ groups: grouped });
}
