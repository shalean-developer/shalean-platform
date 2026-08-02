import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  loadOfficePayoutPeriodReport,
  normalizeOfficePayoutPeriodRange,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function correctUniqueBatchBookingCounts(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  report: Awaited<ReturnType<typeof loadOfficePayoutPeriodReport>>,
) {
  const payoutIds = report.payouts.map((payout) => payout.id).filter(Boolean);
  if (!payoutIds.length) return report;

  const [{ data: linked, error: linkedError }, { data: rosterLinked, error: rosterError }, { data: teamLinked, error: teamError }] =
    await Promise.all([
      admin.from("bookings").select("id, payout_id").in("payout_id", payoutIds),
      admin
        .from("booking_roster_member_payouts")
        .select("booking_id, cleaner_payout_id")
        .in("cleaner_payout_id", payoutIds),
      admin
        .from("team_job_member_payouts")
        .select("booking_id, cleaner_payout_id")
        .in("cleaner_payout_id", payoutIds),
    ]);

  const queryError = linkedError ?? rosterError ?? teamError;
  if (queryError) throw new Error(queryError.message);

  const bookingIdsByPayout = new Map<string, Set<string>>();
  const addBooking = (payoutIdRaw: unknown, bookingIdRaw: unknown) => {
    const payoutId = String(payoutIdRaw ?? "").trim();
    const bookingId = String(bookingIdRaw ?? "").trim();
    if (!payoutId || !bookingId) return;
    const bookingIds = bookingIdsByPayout.get(payoutId) ?? new Set<string>();
    bookingIds.add(bookingId);
    bookingIdsByPayout.set(payoutId, bookingIds);
  };

  for (const row of linked ?? []) {
    const booking = row as { id?: string | null; payout_id?: string | null };
    addBooking(booking.payout_id, booking.id);
  }
  for (const row of rosterLinked ?? []) {
    const payout = row as { booking_id?: string | null; cleaner_payout_id?: string | null };
    addBooking(payout.cleaner_payout_id, payout.booking_id);
  }
  for (const row of teamLinked ?? []) {
    const payout = row as { booking_id?: string | null; cleaner_payout_id?: string | null };
    addBooking(payout.cleaner_payout_id, payout.booking_id);
  }

  return {
    ...report,
    payouts: report.payouts.map((payout) => ({
      ...payout,
      booking_count: bookingIdsByPayout.get(payout.id)?.size ?? 0,
    })),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const { from, to } = normalizeOfficePayoutPeriodRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );

  try {
    const report = await loadOfficePayoutPeriodReport(admin, from, to);
    const correctedReport = await correctUniqueBatchBookingCounts(admin, report);
    return NextResponse.json(correctedReport);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load payout period report.";
    console.error("[period-report]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
