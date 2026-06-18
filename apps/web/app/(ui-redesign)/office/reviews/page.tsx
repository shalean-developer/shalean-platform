"use client";

import { useState } from "react";
import { Search, Star, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

type ReviewRow = {
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
  is_public: boolean | null;
};

type ReviewsResponse = {
  reviews: ReviewRow[];
};

function StarRating({ rating }: { rating: number | null }) {
  const r = Math.round(rating ?? 0);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-3.5 w-3.5", i < r ? "fill-yellow-400 text-yellow-400" : "text-slate-200")}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-slate-700">{rating?.toFixed(1) ?? "—"}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export default function ReviewsPage() {
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");

  const { data, loading, error, refetch } = useAdminData<ReviewsResponse>("/api/admin/reviews", {
    params: { limit: "200" },
  });

  const reviews = data?.reviews ?? [];

  const filtered = reviews.filter((r) => {
    const s =
      !search ||
      (r.reviewer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.reviewer_email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.cleaner_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.comment ?? "").toLowerCase().includes(search.toLowerCase());
    const rf = ratingFilter === "all" || Math.round(r.rating ?? 0) === ratingFilter;
    return s && rf;
  });

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length
      : 0;

  const fiveStarCount = reviews.filter((r) => Math.round(r.rating ?? 0) === 5).length;
  const lowRatingCount = reviews.filter((r) => (r.rating ?? 5) < 3).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reviews</h1>
          <p className="mt-0.5 text-sm text-slate-500">Customer feedback and cleaner ratings.</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total reviews",  value: loading ? "—" : reviews.length,            color: "text-slate-800" },
          { label: "Avg rating",     value: loading ? "—" : avgRating.toFixed(2),      color: "text-yellow-600" },
          { label: "5-star reviews", value: loading ? "—" : fiveStarCount,             color: "text-emerald-600" },
          { label: "Low ratings",    value: loading ? "—" : lowRatingCount,            color: lowRatingCount > 0 ? "text-red-600" : "text-slate-400" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search reviews…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300"
            />
          </div>
          <div className="flex gap-1">
            {(["all", 5, 4, 3, 2, 1] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRatingFilter(r)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  ratingFilter === r ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {r === "all" ? "All" : `${r}★`}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No reviews found.</div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {r.reviewer_name ?? r.reviewer_email ?? "Anonymous"}
                      </p>
                      {r.cleaner_name && (
                        <span className="text-xs text-slate-400">→ {r.cleaner_name}</span>
                      )}
                      {r.service && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 capitalize">
                          {r.service.replace(/-/g, " ")}
                        </span>
                      )}
                    </div>
                    <StarRating rating={r.rating} />
                    {r.comment && (
                      <p className="mt-1.5 text-sm text-slate-600 line-clamp-2">{r.comment}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-slate-400">{formatDate(r.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">
            {loading ? "Loading…" : `${filtered.length} of ${reviews.length} reviews`}
          </p>
        </div>
      </div>
    </div>
  );
}
