"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AnalyticsPayload = {
  window?: { sinceIso?: string; untilIso?: string; days?: number };
  promptsSent?: number;
  promptClicks?: number;
  reviewsSubmitted?: number;
  conversionPct?: number | null;
  clickThroughPct?: number | null;
  error?: string;
};

export default function AdminReviewFunnelAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError("Sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/reviews/analytics?days=7", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json().catch(() => ({}))) as AnalyticsPayload & { error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setError(j.error ?? "Failed to load analytics.");
        setData(null);
      } else {
        setError(null);
        setData(j);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading review funnel…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Review funnel</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Last {data?.window?.days ?? 7} days from <code className="text-xs">user_events</code> (
            <code className="text-xs">computeReviewPromptConversionRate</code>).
          </p>
        </div>
        <Link
          href="/admin/reviews"
          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Reviews
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prompts sent</CardTitle>
            <CardDescription>SMS / logged sends with payload.sent = true</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {data?.promptsSent ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prompt clicks</CardTitle>
            <CardDescription>Review link opened (growth / analytics pipeline)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {data?.promptClicks ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reviews submitted</CardTitle>
            <CardDescription>API / KPI events in window</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {data?.reviewsSubmitted ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversion</CardTitle>
            <CardDescription>Submitted ÷ prompts sent</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {data?.conversionPct != null ? `${data.conversionPct}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Click-through (clicks ÷ sent):{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {data?.clickThroughPct != null ? `${data.clickThroughPct}%` : "—"}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
