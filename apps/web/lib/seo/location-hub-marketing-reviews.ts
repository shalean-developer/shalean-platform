import { cache } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";

export type LocationHubMarketingReviewSnippet = {
  id: string;
  rating: number;
  commentExcerpt: string;
  suburbLabel: string;
  reviewerLabel: string;
};

function parseRpcRows(data: unknown): LocationHubMarketingReviewSnippet[] {
  if (!Array.isArray(data)) return [];
  const out: LocationHubMarketingReviewSnippet[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const rawId = o.id;
    const id = typeof rawId === "string" ? rawId : rawId != null ? String(rawId) : "";
    const rating = Number(o.rating);
    const excerpt = typeof o.comment_excerpt === "string" ? o.comment_excerpt.trim() : "";
    if (!id || !Number.isFinite(rating) || rating < 1 || rating > 5 || excerpt.length < 10) continue;
    out.push({
      id,
      rating: Math.round(rating),
      commentExcerpt: excerpt,
      suburbLabel: typeof o.suburb_label === "string" ? o.suburb_label.trim() : "",
      reviewerLabel: typeof o.reviewer_label === "string" ? o.reviewer_label.trim() : "",
    });
  }
  return out;
}

function normalizeReviewerLabel(raw: string): string {
  const t = raw.trim();
  if (!t || t.toLowerCase() === "customer") return "Verified customer";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Recent review snippets for a suburb name (matches `bookings.location` substring).
 * Uses SECURITY DEFINER RPC — safe with anon server client.
 */
export const getLocationHubMarketingReviews = cache(
  async (areaName: string, limit = 4): Promise<LocationHubMarketingReviewSnippet[]> => {
    const sb = getSupabaseServer();
    if (!sb) return [];
    const { data, error } = await sb.rpc("public_marketing_reviews_for_area", {
      p_area: areaName.trim(),
      p_limit: limit,
    });
    if (error) {
      console.error("[locationHubMarketingReviews]", error.message);
      return [];
    }
    let payload: unknown = data;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload) as unknown;
      } catch {
        return [];
      }
    }
    const rows = Array.isArray(payload) ? payload : [];
    const parsed = parseRpcRows(rows);
    return parsed.map((r) => ({
      ...r,
      reviewerLabel: normalizeReviewerLabel(r.reviewerLabel),
    }));
  },
);
