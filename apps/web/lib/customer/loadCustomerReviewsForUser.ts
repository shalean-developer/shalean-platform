import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewRow } from "@/lib/dashboard/types";

export type CustomerReviewListItem = ReviewRow & {
  serviceName: string;
  bookingDate: string | null;
  cleanerName: string | null;
};

export async function loadCustomerReviewsForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true; reviews: CustomerReviewListItem[] } | { ok: false; error: string; status: number }> {
  const { data: rows, error } = await admin
    .from("reviews")
    .select("id, booking_id, user_id, cleaner_id, rating, comment, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return { ok: false, error: "Could not load reviews.", status: 500 };
  }

  const reviews = (rows ?? []) as ReviewRow[];
  if (reviews.length === 0) {
    return { ok: true, reviews: [] };
  }

  const cleanerIds = Array.from(
    new Set(reviews.map((r) => String(r.cleaner_id ?? "").trim()).filter((id) => id.length > 0)),
  );
  const bookingIds = Array.from(
    new Set(reviews.map((r) => String(r.booking_id ?? "").trim()).filter((id) => id.length > 0)),
  );

  const [cleanersRes, bookingsRes] = await Promise.all([
    cleanerIds.length > 0
      ? admin.from("cleaners").select("id, full_name").in("id", cleanerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
    bookingIds.length > 0
      ? admin.from("bookings").select("id, service, date").in("id", bookingIds)
      : Promise.resolve({ data: [] as { id: string; service: string | null; date: string | null }[], error: null }),
  ]);

  const cleanerNameById = new Map<string, string>();
  for (const c of cleanersRes.data ?? []) {
    const id = String((c as { id?: string }).id ?? "");
    const name = typeof (c as { full_name?: string | null }).full_name === "string"
      ? (c as { full_name: string }).full_name.trim()
      : "";
    if (id && name) cleanerNameById.set(id, name);
  }

  const bookingById = new Map<string, { service: string | null; date: string | null }>();
  for (const b of bookingsRes.data ?? []) {
    const id = String((b as { id?: string }).id ?? "");
    if (!id) continue;
    bookingById.set(id, {
      service: typeof (b as { service?: string | null }).service === "string" ? (b as { service: string }).service : null,
      date: typeof (b as { date?: string | null }).date === "string" ? (b as { date: string }).date : null,
    });
  }

  const enriched: CustomerReviewListItem[] = reviews.map((r) => {
    const booking = bookingById.get(String(r.booking_id ?? ""));
    const svc = booking?.service?.trim() ?? "";
    const bdate = booking?.date?.trim() ?? null;
    const cleanerName = cleanerNameById.get(String(r.cleaner_id ?? "")) ?? null;
    return {
      ...r,
      serviceName: svc || `Booking ${String(r.booking_id).slice(0, 8)}…`,
      bookingDate: bdate,
      cleanerName,
    };
  });

  return { ok: true, reviews: enriched };
}
