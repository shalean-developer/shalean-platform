import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PublicReview } from "./publicReviewDetails";
import { parseReviewsPage, REVIEWS_PAGE_SIZE } from "./reviewPagination";

/** Accept only the explicit, consent-gated public projection. */
export function parsePublishedReviews(data: unknown): PublicReview[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    if (typeof r.rating !== "number" || !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5 ||
        typeof r.comment !== "string" || !r.comment.trim() || typeof r.id !== "string" ||
        typeof r.created_at !== "string" || !Number.isFinite(Date.parse(r.created_at))) return [];
    return [{ id: r.id, rating: r.rating as PublicReview["rating"], comment: r.comment.trim(), createdAt: r.created_at,
      displayName: typeof r.display_name === "string" ? r.display_name : null,
      suburb: typeof r.suburb_label === "string" ? r.suburb_label : null,
      serviceKey: typeof r.service_key === "string" ? r.service_key : null }];
  });
}

export const getPublishedReviews = cache(async (requestedPage: number) => {
  await connection();
  const page = parseReviewsPage(String(requestedPage));
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("published_customer_reviews", {
      p_offset: (page - 1) * REVIEWS_PAGE_SIZE, p_limit: REVIEWS_PAGE_SIZE + 1,
    });
    if (error) {
      console.warn("[customer-reviews] Published reviews unavailable", { code: error.code });
      return null;
    }
    const reviews = parsePublishedReviews(data);
    return { reviews: reviews.slice(0, REVIEWS_PAGE_SIZE), hasMore: reviews.length > REVIEWS_PAGE_SIZE, page };
  } catch {
    console.warn("[customer-reviews] Published reviews unavailable");
    return null;
  }
});
