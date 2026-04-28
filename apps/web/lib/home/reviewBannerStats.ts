import { cache } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";

export type PublicReviewBannerStats = {
  avgRating: number;
  reviewCount: number;
};

/**
 * Non-hidden reviews aggregate for marketing (RPC is `SECURITY DEFINER`; readable with anon key).
 */
export const getPublicReviewBannerStats = cache(async (): Promise<PublicReviewBannerStats | null> => {
  const sb = getSupabaseServer();
  if (!sb) return null;
  const { data, error } = await sb.rpc("public_review_banner_stats");
  if (error) {
    console.error("[reviewBannerStats]", error.message);
    return null;
  }
  let row: unknown = data;
  if (typeof row === "string") {
    try {
      row = JSON.parse(row) as unknown;
    } catch {
      return null;
    }
  }
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const o = row as Record<string, unknown>;
  const cnt = Number(o.review_count ?? 0);
  const avgRaw = o.avg_rating;
  const avg = typeof avgRaw === "number" ? avgRaw : avgRaw != null ? Number(avgRaw) : NaN;
  if (!Number.isFinite(cnt) || cnt < 1 || !Number.isFinite(avg)) return null;
  return { avgRating: avg, reviewCount: Math.round(cnt) };
});
