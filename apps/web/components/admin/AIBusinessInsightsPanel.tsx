"use client";

import { useCallback, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type NarrativeResponse = {
  aiBusinessInsights?: string | null;
  aiBusinessInsightsNote?: string;
  error?: string;
};

/**
 * Fetches OpenAI-backed narrative from `GET /api/admin/ai-insights?narrative=1` (admin session required).
 * Uses a compact server-side summary — no raw DB export to the browser.
 */
export function AIBusinessInsightsPanel() {
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    setText(null);
    try {
      const sb = getSupabaseBrowser();
      const session = await sb?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        setError("Please sign in as admin.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/ai-insights?narrative=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as NarrativeResponse;
      if (!res.ok) {
        setError(json.error ?? "Failed to load AI insights.");
        setLoading(false);
        return;
      }
      if (json.aiBusinessInsights) {
        setText(json.aiBusinessInsights);
      }
      if (json.aiBusinessInsightsNote) {
        setNote(json.aiBusinessInsightsNote);
      }
      if (!json.aiBusinessInsights && !json.aiBusinessInsightsNote) {
        setNote("No narrative returned.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="rounded-xl border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-900/50 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">AI business analyst</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-500 dark:text-zinc-400">
            Natural-language read on aggregated completed bookings. Run on demand — uses OpenAI only when you click
            generate (nothing is written back to the database).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-sky-700"
        >
          {loading ? "Generating…" : "Generate AI insights"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {note && !text ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          {note}
        </p>
      ) : null}

      {note && text ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/90">{note}</p>
      ) : null}

      {text ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
            {text}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
