import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type BookingReviewSummary = { average: number | null; count: number };

export function parseBookingReviewSummary(data: unknown): BookingReviewSummary | null {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== "object") return null;
  const r = data[0] as Record<string, unknown>;
  const count = typeof r.review_count === "number" ? r.review_count : typeof r.review_count === "string" && /^\d+$/.test(r.review_count) ? Number(r.review_count) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) return null;
  if (count === 0) return r.avg_rating === null ? { average: null, count: 0 } : null;
  const average = typeof r.avg_rating === "number" ? r.avg_rating : typeof r.avg_rating === "string" && /^\d+(\.\d+)?$/.test(r.avg_rating) ? Number(r.avg_rating) : NaN;
  return Number.isFinite(average) && average >= 1 && average <= 5 ? { average, count } : null;
}

export const getBookingReviewSummary = cache(async (): Promise<BookingReviewSummary | null> => {
  await connection();
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("booking_review_rating_summary");
    if (error) {
      console.warn("[booking-review-summary] Ratings unavailable", { code: error.code });
      return null;
    }
    return parseBookingReviewSummary(data);
  } catch {
    console.warn("[booking-review-summary] Ratings unavailable");
    return null;
  }
});
