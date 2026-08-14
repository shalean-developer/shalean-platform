import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: bookingData, error } = await admin
    .from("bookings")
    .select(
      [
        "id",
        "booking_reference",
        "service",
        "service_slug",
        "date",
        "time",
        "location",
        "suburb",
        "customer_name",
        "customer_email",
        "customer_phone",
        "status",
        "payment_status",
        "payment_completed_at",
        "total_paid_cents",
        "amount_paid_cents",
        "total_paid_zar",
        "total_price",
        "duration_minutes",
        "duration_hours",
        "estimated_duration_minutes",
        "pricing_summary",
        "price_breakdown",
        "price_snapshot",
        "selected_extras",
        "extras",
        "service_details",
        "booking_snapshot",
        "access_instructions",
        "parking_instructions",
        "gate_code",
        "is_team_job",
        "team_id",
        "cleaner_id",
        "team_member_count_snapshot",
        "earnings_summary",
        "cleaner_earnings_total_cents",
        "company_revenue_cents",
        "display_earnings_cents",
        "zoho_invoice_number",
        "zoho_invoice_id",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!bookingData) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const booking = bookingData as unknown as Record<string, unknown>;

  const { data: rosterRows, error: rosterError } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role, lead_bonus_cents, payout_weight, assigned_at")
    .eq("booking_id", id)
    .order("assigned_at", { ascending: true });

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });

  const persistedRoster = (rosterRows ?? []) as Array<Record<string, unknown>>;
  const directCleanerId = String(booking.cleaner_id ?? "").trim();
  const rosterCleanerIds = persistedRoster
    .map((row) => String(row.cleaner_id ?? "").trim())
    .filter(Boolean);
  const cleanerIds = [...new Set([...rosterCleanerIds, ...(directCleanerId ? [directCleanerId] : [])])];

  let cleanerById = new Map<string, { id: string; full_name: string | null; rating: number | null; jobs_completed: number | null }>();
  if (cleanerIds.length > 0) {
    const { data: cleanerRows, error: cleanerError } = await admin
      .from("cleaners")
      .select("id, full_name, rating, jobs_completed")
      .in("id", cleanerIds);
    if (cleanerError) return NextResponse.json({ error: cleanerError.message }, { status: 500 });
    cleanerById = new Map((cleanerRows ?? []).map((row) => [String(row.id), row]));
  }

  const earningsSummary = booking.earnings_summary && typeof booking.earnings_summary === "object" && !Array.isArray(booking.earnings_summary)
    ? (booking.earnings_summary as Record<string, unknown>)
    : null;
  const perCleaner = Array.isArray(earningsSummary?.per_cleaner_earnings)
    ? (earningsSummary.per_cleaner_earnings as Array<Record<string, unknown>>)
    : [];
  const earningByCleanerId = new Map(
    perCleaner.map((row) => [String(row.cleaner_id ?? ""), Number(row.total_cents ?? row.base_earning_cents ?? 0)]),
  );

  const effectiveRoster = persistedRoster.length > 0
    ? persistedRoster
    : directCleanerId
      ? [{ cleaner_id: directCleanerId, role: "solo", assigned_at: booking.updated_at ?? booking.created_at ?? null }]
      : [];

  const roster = effectiveRoster.map((row) => {
    const cleanerId = String(row.cleaner_id ?? "");
    const cleaner = cleanerById.get(cleanerId);
    const summaryEarning = earningByCleanerId.get(cleanerId);
    const fallbackDisplayEarning = effectiveRoster.length === 1 ? Number(booking.display_earnings_cents ?? 0) : 0;
    return {
      cleaner_id: cleanerId,
      name: cleaner?.full_name ?? "Cleaner",
      role: String(row.role ?? (effectiveRoster.length === 1 ? "solo" : "member")),
      rating: cleaner?.rating ?? null,
      jobs_completed: cleaner?.jobs_completed ?? null,
      earning_cents: Number.isFinite(summaryEarning) && Number(summaryEarning) > 0
        ? Number(summaryEarning)
        : fallbackDisplayEarning > 0
          ? fallbackDisplayEarning
          : null,
    };
  });

  return NextResponse.json({ booking, roster });
}
