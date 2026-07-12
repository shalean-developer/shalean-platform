import { NextResponse } from "next/server";
import {
  CLEANER_WEEKDAY_CODES,
  CLEANER_WEEKDAY_LABELS,
  normalizeCleanerAvailabilityWeekdays,
  type CleanerWeekdayCode,
} from "@shalean/types/availabilityWeekdays";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

function anonymizeName(raw: string | null | undefined): string {
  const first = String(raw ?? "")
    .trim()
    .split(/\s+/)[0];
  if (!first) return "Customer";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Public cleaner profile enrichment for booking funnel (reviews + weekday availability).
 * Does not expose phone/email/auth fields.
 */
export async function GET(_request: Request, context: RouteContext) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { id: rawId } = await context.params;
  const id = String(rawId ?? "").trim();
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid cleaner id." }, { status: 400 });
  }

  const { data: cleaner, error: cleanerErr } = await admin
    .from("cleaners")
    .select(
      "id, full_name, rating, jobs_completed, is_available, status, location, availability_weekdays, availability_start, availability_end",
    )
    .eq("id", id)
    .maybeSingle();

  if (cleanerErr) {
    return NextResponse.json({ error: cleanerErr.message }, { status: 500 });
  }
  if (!cleaner) {
    return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });
  }

  const status = String((cleaner as { status?: string | null }).status ?? "").toLowerCase();
  if (["inactive", "suspended", "rejected", "banned"].includes(status)) {
    return NextResponse.json({ error: "Cleaner not available." }, { status: 404 });
  }

  const weekdays = normalizeCleanerAvailabilityWeekdays(
    (cleaner as { availability_weekdays?: unknown }).availability_weekdays,
  );
  const weekdayLabels = CLEANER_WEEKDAY_CODES.filter((c) =>
    weekdays.includes(c),
  ).map((c: CleanerWeekdayCode) => CLEANER_WEEKDAY_LABELS[c]);

  const { data: reviewRows, error: reviewErr } = await admin
    .from("reviews")
    .select("id, rating, comment, created_at, booking_id, is_hidden")
    .eq("cleaner_id", id)
    .or("is_hidden.is.null,is_hidden.eq.false")
    .order("created_at", { ascending: false })
    .limit(8);

  if (reviewErr) {
    return NextResponse.json({ error: reviewErr.message }, { status: 500 });
  }

  const rows = (reviewRows ?? []) as {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    booking_id: string;
    is_hidden?: boolean | null;
  }[];

  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))];
  const bookingNameMap = new Map<string, string | null>();
  if (bookingIds.length) {
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, customer_name")
      .in("id", bookingIds);
    for (const b of bookings ?? []) {
      const row = b as { id?: string; customer_name?: string | null };
      const bid = String(row.id ?? "").trim();
      if (bid) bookingNameMap.set(bid, row.customer_name?.trim() || null);
    }
  }

  const { count: reviewCount } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("cleaner_id", id)
    .or("is_hidden.is.null,is_hidden.eq.false");

  const reviews = rows.map((r) => ({
    id: r.id,
    rating: Number(r.rating) || 0,
    comment: r.comment?.trim() || null,
    createdAt: r.created_at,
    reviewerName: anonymizeName(bookingNameMap.get(r.booking_id)),
  }));

  const start = (cleaner as { availability_start?: string | null }).availability_start?.trim() || null;
  const end = (cleaner as { availability_end?: string | null }).availability_end?.trim() || null;

  return NextResponse.json({
    ok: true,
    cleanerId: id,
    name: (cleaner as { full_name?: string | null }).full_name?.trim() || "Cleaner",
    rating: (cleaner as { rating?: number | null }).rating ?? null,
    jobsCompleted: (cleaner as { jobs_completed?: number | null }).jobs_completed ?? 0,
    areasServed: (cleaner as { location?: string | null }).location?.trim() || null,
    isAvailable: Boolean((cleaner as { is_available?: boolean | null }).is_available),
    availability: {
      weekdays,
      weekdayLabels,
      startTime: start,
      endTime: end,
    },
    reviewCount: reviewCount ?? reviews.length,
    reviews,
  });
}
