import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminReviewListRow = {
  id: string;
  booking_id: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  cleaner_id: string | null;
  cleaner_name: string | null;
  rating: number | null;
  comment: string | null;
  created_at: string;
  service: string | null;
  public_display_consent: boolean;
  homepage_approved: boolean;
  is_public: boolean;
  is_hidden: boolean;
};

type ReviewDbRow = {
  id: string;
  booking_id: string;
  cleaner_id: string;
  user_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  is_hidden: boolean | null;
  public_display_consent: boolean;
};

export async function loadAdminReviewsList(
  admin: SupabaseClient,
  limit = 200,
): Promise<{ reviews: AdminReviewListRow[] } | { error: string }> {
  const cappedLimit = Math.min(Math.max(limit, 1), 500);

  const { data, error } = await admin
    .from("reviews")
    .select("id, booking_id, cleaner_id, user_id, rating, comment, created_at, is_hidden, public_display_consent")
    .order("created_at", { ascending: false })
    .limit(cappedLimit);

  if (error) return { error: error.message };

  const rows = (data ?? []) as ReviewDbRow[];
  if (rows.length === 0) return { reviews: [] };

  const published = new Set<string>();
  for (let offset = 0; offset < rows.length; offset += 100) {
    const { data: approvals, error: approvalError } = await admin.from("review_homepage_publications")
      .select("review_id").in("review_id", rows.slice(offset, offset + 100).map((row) => row.id));
    if (approvalError) return { error: approvalError.message };
    for (const approval of approvals ?? []) published.add(String(approval.review_id));
  }

  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))];
  const cleanerIds = [...new Set(rows.map((r) => r.cleaner_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];

  const bookingMap = new Map<
    string,
    { customer_name: string | null; customer_email: string | null; service: string | null; service_slug: string | null }
  >();
  if (bookingIds.length) {
    const { data: bookings, error: bookingErr } = await admin
      .from("bookings")
      .select("id, customer_name, customer_email, service, service_slug")
      .in("id", bookingIds);
    if (bookingErr) return { error: bookingErr.message };
    for (const b of bookings ?? []) {
      const row = b as {
        id?: string;
        customer_name?: string | null;
        customer_email?: string | null;
        service?: string | null;
        service_slug?: string | null;
      };
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      bookingMap.set(id, {
        customer_name: row.customer_name?.trim() || null,
        customer_email: row.customer_email?.trim() || null,
        service: row.service?.trim() || row.service_slug?.trim() || null,
        service_slug: row.service_slug?.trim() || null,
      });
    }
  }

  const cleanerMap = new Map<string, string | null>();
  if (cleanerIds.length) {
    const { data: cleaners, error: cleanerErr } = await admin
      .from("cleaners")
      .select("id, full_name")
      .in("id", cleanerIds);
    if (cleanerErr) return { error: cleanerErr.message };
    for (const c of cleaners ?? []) {
      const row = c as { id?: string; full_name?: string | null };
      const id = String(row.id ?? "").trim();
      if (id) cleanerMap.set(id, row.full_name?.trim() || null);
    }
  }

  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length) {
    const { data: profiles, error: profileErr } = await admin
      .from("user_profiles")
      .select("id, full_name, billing_email")
      .in("id", userIds);
    if (profileErr) return { error: profileErr.message };
    for (const p of profiles ?? []) {
      const row = p as { id?: string; full_name?: string | null; billing_email?: string | null };
      const id = String(row.id ?? "").trim();
      if (id) {
        profileMap.set(id, {
          full_name: row.full_name?.trim() || null,
          email: row.billing_email?.trim() || null,
        });
      }
    }
  }

  const reviews: AdminReviewListRow[] = rows.map((row) => {
    const booking = bookingMap.get(row.booking_id);
    const profile = row.user_id ? profileMap.get(row.user_id) : undefined;
    const hidden = Boolean(row.is_hidden);

    return {
      id: row.id,
      booking_id: row.booking_id,
      reviewer_name: profile?.full_name ?? booking?.customer_name ?? null,
      reviewer_email: profile?.email ?? booking?.customer_email ?? null,
      cleaner_id: row.cleaner_id,
      cleaner_name: cleanerMap.get(row.cleaner_id) ?? null,
      rating: row.rating,
      comment: row.comment,
      created_at: row.created_at,
      service: booking?.service ?? null,
      public_display_consent: row.public_display_consent === true,
      homepage_approved: published.has(row.id),
      is_public: !hidden,
      is_hidden: hidden,
    };
  });

  return { reviews };
}
