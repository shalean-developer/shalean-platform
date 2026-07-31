import type { SupabaseClient } from "@supabase/supabase-js";

export type CleanerPayoutBatchItemSource = "booking" | "roster_member" | "team_member";

export type CleanerPayoutBatchItem = {
  source: CleanerPayoutBatchItemSource;
  line_id: string;
  booking_id: string;
  cleaner_id: string;
  customer_name: string | null;
  service: string | null;
  date: string | null;
  payout_cents: number;
  bonus_cents: number;
  is_test: boolean;
  booking_status: string | null;
  refunded_at: string | null;
};

function cents(value: unknown): number {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value)));
}

type BookingMeta = {
  id: string;
  cleaner_id: string | null;
  customer_name: string | null;
  service: string | null;
  date: string | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  is_test: boolean | null;
  status: string | null;
  refunded_at: string | null;
};

export async function loadCleanerPayoutBatchItems(
  admin: SupabaseClient,
  payoutId: string,
): Promise<{ items: CleanerPayoutBatchItem[]; totalCents: number; error: string | null }> {
  const [{ data: direct, error: directErr }, { data: roster, error: rosterErr }, { data: team, error: teamErr }] =
    await Promise.all([
      admin
        .from("bookings")
        .select(
          "id, cleaner_id, customer_name, service, date, cleaner_payout_cents, cleaner_bonus_cents, is_test, status, refunded_at",
        )
        .eq("payout_id", payoutId),
      admin
        .from("booking_roster_member_payouts")
        .select("id, booking_id, cleaner_id, payout_cents, bonus_cents, status")
        .eq("cleaner_payout_id", payoutId),
      admin
        .from("team_job_member_payouts")
        .select("id, booking_id, cleaner_id, payout_cents, status")
        .eq("cleaner_payout_id", payoutId),
    ]);

  const firstError = directErr ?? rosterErr ?? teamErr;
  if (firstError) return { items: [], totalCents: 0, error: firstError.message };

  const memberBookingIds = [
    ...new Set(
      [...(roster ?? []), ...(team ?? [])]
        .map((row) => String((row as { booking_id?: string }).booking_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const bookingById = new Map<string, BookingMeta>();
  if (memberBookingIds.length > 0) {
    for (let i = 0; i < memberBookingIds.length; i += 120) {
      const { data, error } = await admin
        .from("bookings")
        .select("id, cleaner_id, customer_name, service, date, cleaner_payout_cents, cleaner_bonus_cents, is_test, status, refunded_at")
        .in("id", memberBookingIds.slice(i, i + 120));
      if (error) return { items: [], totalCents: 0, error: error.message };
      for (const raw of data ?? []) {
        const row = raw as BookingMeta;
        if (row.id) bookingById.set(row.id, row);
      }
    }
  }

  const items: CleanerPayoutBatchItem[] = [];
  for (const raw of direct ?? []) {
    const row = raw as BookingMeta;
    items.push({
      source: "booking",
      line_id: row.id,
      booking_id: row.id,
      cleaner_id: String(row.cleaner_id ?? "").trim(),
      customer_name: row.customer_name ?? null,
      service: row.service ?? null,
      date: row.date ?? null,
      payout_cents: cents(row.cleaner_payout_cents),
      bonus_cents: cents(row.cleaner_bonus_cents),
      is_test: row.is_test === true,
      booking_status: row.status ?? null,
      refunded_at: row.refunded_at ?? null,
    });
  }

  for (const raw of roster ?? []) {
    const row = raw as {
      id?: string;
      booking_id?: string;
      cleaner_id?: string;
      payout_cents?: number | null;
      bonus_cents?: number | null;
    };
    const bookingId = String(row.booking_id ?? "").trim();
    const booking = bookingById.get(bookingId);
    if (!row.id || !booking) continue;
    items.push({
      source: "roster_member",
      line_id: row.id,
      booking_id: bookingId,
      cleaner_id: String(row.cleaner_id ?? "").trim(),
      customer_name: booking.customer_name ?? null,
      service: booking.service ?? null,
      date: booking.date ?? null,
      payout_cents: cents(row.payout_cents),
      bonus_cents: cents(row.bonus_cents),
      is_test: booking.is_test === true,
      booking_status: booking.status ?? null,
      refunded_at: booking.refunded_at ?? null,
    });
  }

  for (const raw of team ?? []) {
    const row = raw as { id?: string; booking_id?: string; cleaner_id?: string; payout_cents?: number | null };
    const bookingId = String(row.booking_id ?? "").trim();
    const booking = bookingById.get(bookingId);
    if (!row.id || !booking) continue;
    items.push({
      source: "team_member",
      line_id: row.id,
      booking_id: bookingId,
      cleaner_id: String(row.cleaner_id ?? "").trim(),
      customer_name: booking.customer_name ?? null,
      service: booking.service ?? null,
      date: booking.date ?? null,
      payout_cents: cents(row.payout_cents),
      bonus_cents: 0,
      is_test: booking.is_test === true,
      booking_status: booking.status ?? null,
      refunded_at: booking.refunded_at ?? null,
    });
  }

  items.sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")) || a.booking_id.localeCompare(b.booking_id));
  return {
    items,
    totalCents: items.reduce((sum, item) => sum + item.payout_cents + item.bonus_cents, 0),
    error: null,
  };
}
