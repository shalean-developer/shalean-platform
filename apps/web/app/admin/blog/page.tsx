"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: string;
  source: string;
  updated_at: string;
  published_at: string | null;
};

async function getToken(): Promise<string | null> {
  const sb = getSupabaseBrowser();
  const session = await sb?.auth.getSession();
  return session?.data.session?.access_token ?? null;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

export default function AdminBlogListPage() {
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    const q = filter === "all" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/admin/blog/posts${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as { posts?: Row[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load posts.");
      setRows([]);
    } else {
      setRows(json.posts ?? []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Blog posts</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Drafts and published articles (Supabase).</p>
        </div>
        <Button asChild>
          <Link href="/admin/blog/new">New post</Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["all", "draft", "published"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition",
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
            )}
          >
            {f === "all" ? "All" : f === "draft" ? "Drafts" : "Published"}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <p className="p-6 text-sm text-zinc-600">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-zinc-600">No posts in this filter.</p>
        ) : (
          <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">Title</th>
                <th className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">Status</th>
                <th className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">Source</th>
                <th className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/blog/${r.id}`} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                      {r.title}
                    </Link>
                    <div className="text-xs text-zinc-500">{r.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.status}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.source}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
