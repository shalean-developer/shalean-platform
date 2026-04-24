"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { AttentionRequiredPanel } from "@/components/admin/AttentionRequiredPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardStats = {
  revenueTodayZar: number;
  revenueMonthZar: number;
  paidBookingsToday: number;
  paidBookingsMonth: number;
  totalBookingsWindow: number;
  avgBookingValueZar: number;
  conversionRatePct: number;
  funnelSessionsQuote: number;
  funnelSessionsPayment: number;
  error?: string;
};

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError("Please sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/dashboard-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as DashboardStats & { error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load dashboard.");
        setData(null);
      } else {
        setError(null);
        setData(json);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <AttentionRequiredPanel />
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Overview</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Revenue and bookings from Supabase. Conversion uses <span className="font-medium">booking_events</span> (quote
          views → checkout) over the last 30 days.
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          <Link href="/admin/ops/sla-breaches" className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
            SLA breach queue
          </Link>
          {" · "}
          <Link
            href="/admin/notifications"
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            Notification monitoring
          </Link>
          {" · "}
          <Link
            href="/admin/ops/cleaner-performance"
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            Cleaner performance
          </Link>
          {" · "}
          <Link href="/admin/operations" className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
            Operations analytics
          </Link>{" "}
          (dispatch, supply, legacy funnel).
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Revenue today</CardDescription>
              <CardTitle className="text-2xl tabular-nums">R {data.revenueTodayZar.toLocaleString("en-ZA")}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">Paid bookings today: {data.paidBookingsToday}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Revenue this month</CardDescription>
              <CardTitle className="text-2xl tabular-nums">R {data.revenueMonthZar.toLocaleString("en-ZA")}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">Paid bookings (MTD): {data.paidBookingsMonth}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Bookings (30d window)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{data.totalBookingsWindow}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">All rows in rolling window from API query</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg booking value</CardDescription>
              <CardTitle className="text-2xl tabular-nums">R {data.avgBookingValueZar.toLocaleString("en-ZA")}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">Among paid bookings in window</CardContent>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-4">
            <CardHeader className="pb-2">
              <CardDescription>Conversion rate</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{data.conversionRatePct}%</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600 dark:text-zinc-400">
              Sessions that viewed <strong>quote</strong> vs sessions that reached <strong>payment</strong> checkout (
              {data.funnelSessionsPayment} / {Math.max(data.funnelSessionsQuote, 1)} quote sessions).
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
