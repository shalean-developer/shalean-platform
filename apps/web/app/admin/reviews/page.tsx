"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

type ReviewRow = {
  id: string;
  booking_id: string;
  cleaner_id: string;
  user_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  is_hidden?: boolean | null;
};

export default function AdminReviewsPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const sb = getSupabaseBrowser();
    if (!sb) {
      setError("Supabase not configured.");
      setLoading(false);
      return;
    }
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/reviews", { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json().catch(() => ({}))) as { reviews?: ReviewRow[]; error?: string };
    if (!res.ok) {
      setError(j.error ?? "Failed to load reviews.");
      setRows([]);
    } else {
      setRows(Array.isArray(j.reviews) ? j.reviews : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setHidden(id: string, is_hidden: boolean) {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    setTogglingId(id);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_hidden }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Update failed.");
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_hidden } : r)));
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this review? Cleaner stats will be recalculated.")) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/reviews?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Delete failed.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Reviews</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Customer feedback tied to bookings and cleaners.
          </p>
        </div>
        <Link
          href="/admin/reviews/analytics"
          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Funnel analytics →
        </Link>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">No reviews yet.</p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Rating</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Comment</th>
                <th className="px-3 py-2 text-left font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">booking_id</th>
                <th className="px-3 py-2 text-left font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">cleaner_id</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Public</th>
                <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {new Date(r.created_at).toLocaleString("en-ZA")}
                  </td>
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{r.rating}★</td>
                  <td className="max-w-md px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {r.comment ?? "—"}
                    {r.is_hidden ? (
                      <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-400">
                        Hidden from public
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[8rem] truncate px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">{r.booking_id}</td>
                  <td className="max-w-[8rem] truncate px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">{r.cleaner_id}</td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={togglingId === r.id}
                      onClick={() => void setHidden(r.id, !Boolean(r.is_hidden))}
                      title={r.is_hidden ? "Show on site again" : "Hide from public listings"}
                    >
                      {r.is_hidden ? (
                        <>
                          <Eye className="h-4 w-4" aria-hidden />
                          {togglingId === r.id ? "…" : "Unhide"}
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-4 w-4" aria-hidden />
                          {togglingId === r.id ? "…" : "Hide"}
                        </>
                      )}
                    </Button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={deletingId === r.id}
                      onClick={() => void remove(r.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      {deletingId === r.id ? "…" : "Delete"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
