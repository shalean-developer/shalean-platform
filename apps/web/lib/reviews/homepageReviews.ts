import "server-only";
import { connection } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type HomepageReview = {
  id: string;
  rating: 5;
  comment: string;
  createdAt: string;
};

/** An explicit public projection: never pass booking/customer records to the homepage. */
export function parseHomepageReviews(data: unknown): HomepageReview[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    if (r.rating !== 5 || typeof r.comment !== "string" || !r.comment.trim() ||
        typeof r.id !== "string" || typeof r.created_at !== "string" || !Number.isFinite(Date.parse(r.created_at))) return [];
    return [{ id: r.id, rating: 5 as const, comment: r.comment.trim(), createdAt: r.created_at }];
  }).slice(0, 6);
}

export async function getHomepageReviews(): Promise<HomepageReview[]> {
  // Moderation must take effect on the next request, including after an empty build-time state.
  await connection();
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin.rpc("homepage_five_star_reviews");
    // A missing migration or temporary database failure must not break the booking homepage.
    if (error) {
      console.warn("[homepage-reviews] Approved reviews unavailable", { code: error.code });
      return [];
    }
    return parseHomepageReviews(data);
  } catch {
    console.warn("[homepage-reviews] Approved reviews unavailable");
    return [];
  }
}
