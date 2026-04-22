"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Range = "today" | "7d" | "30d";
type MarketingData = {
  kpis: {
    totalAdSpend: number;
    totalBookingsFromAds: number;
    revenueFromAds: number;
    cpa: number;
    roas: number;
  };
  channels: Array<{
    channel: "google_ads" | "facebook_ads" | "organic_seo" | "direct";
    spend: number;
    bookings: number;
    revenue: number;
    cpa: number;
    roas: number;
  }>;
  funnel: {
    visitors: number;
    started: number;
    viewedPrice: number;
    selectedTime: number;
    completed: number;
  };
  funnelConversion: {
    visitToStartPct: number;
    startToPricePct: number;
    priceToTimePct: number;
    timeToCompletePct: number;
  };
  roi: { profit: number; bestChannel: string | null; worstChannel: string | null };
  charts: {
    revenueVsSpend: Array<{ date: string; revenue: number; spend: number }>;
    bookingsPerChannel: Array<{ channel: string; bookings: number }>;
  };
  insights: string[];
};

const CHANNEL_LABEL: Record<string, string> = {
  google_ads: "Google Ads",
  facebook_ads: "Facebook Ads",
  organic_seo: "Organic (SEO)",
  direct: "Direct",
};

function money(v: number): string {
  return `R ${Math.round(v).toLocaleString("en-ZA")}`;
}

export default function AdminMarketingPage() {
  const [range, setRange] = useState<Range>("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MarketingData | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [spendForm, setSpendForm] = useState({
    channel: "google_ads",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
  });

  async function load(r: Range) {
    setLoading(true);
    setError(null);
    const sb = getSupabaseBrowser();
    const session = await sb?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) {
      setError("Please sign in as admin.");
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/admin/marketing?range=${r}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as MarketingData & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load marketing dashboard.");
      setLoading(false);
      return;
    }
    setData(json);
    setLoading(false);
  }

  useEffect(() => {
    void load(range);
  }, [range]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2300);
    return () => clearTimeout(t);
  }, [toast]);

  const maxTrendValue = useMemo(() => {
    const vals = data?.charts.revenueVsSpend.flatMap((d) => [d.revenue, d.spend]) ?? [];
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [data?.charts.revenueVsSpend]);

  const maxBar = useMemo(() => {
    const vals = data?.charts.bookingsPerChannel.map((c) => c.bookings) ?? [];
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [data?.charts.bookingsPerChannel]);

  async function addSpend(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(spendForm.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setToast("Enter a valid spend amount.");
      return;
    }

    const sb = getSupabaseBrowser();
    const session = await sb?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) {
      setToast("Please sign in as admin.");
      return;
    }

    const res = await fetch("/api/admin/marketing", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...spendForm, amount }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setToast(json.error ?? "Could not save spend.");
      return;
    }
    setToast("Spend saved.");
    setSpendForm((p) => ({ ...p, amount: "" }));
    await load(range);
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Marketing Dashboard</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Track ads performance, conversion funnel, and ROI.</p>
        </div>
        <div className="flex gap-2">
          {(["today", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={[
                "h-10 rounded-full px-4 text-sm font-medium",
                range === r
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700",
              ].join(" ")}
            >
              {r === "today" ? "Today" : r === "7d" ? "Last 7 days" : "Last 30 days"}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Manual ad spend input</h2>
        <form onSubmit={addSpend} className="mt-3 grid gap-2 sm:grid-cols-4">
          <select
            value={spendForm.channel}
            onChange={(e) => setSpendForm((p) => ({ ...p, channel: e.target.value }))}
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="google_ads">Google Ads</option>
            <option value="facebook_ads">Facebook Ads</option>
            <option value="organic_seo">Organic (SEO)</option>
            <option value="direct">Direct</option>
          </select>
          <input
            value={spendForm.amount}
            onChange={(e) => setSpendForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="Amount"
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <input
            type="date"
            value={spendForm.date}
            onChange={(e) => setSpendForm((p) => ({ ...p, date: e.target.value }))}
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">Add spend</button>
        </form>
      </section>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : data ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Total ad spend" value={money(data.kpis.totalAdSpend)} />
            <Kpi label="Bookings from ads" value={String(data.kpis.totalBookingsFromAds)} />
            <Kpi label="Revenue from ads" value={money(data.kpis.revenueFromAds)} />
            <Kpi label="Cost per booking (CPA)" value={money(data.kpis.cpa)} />
            <Kpi label="Return on ad spend (ROAS)" value={`${data.kpis.roas.toFixed(2)}x`} />
          </section>

          <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="px-4 pt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Channel performance</h2>
            <table className="mt-3 w-full min-w-[760px] text-left text-sm">
              <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
                <tr>
                  <th className="px-3 py-3">Channel</th><th className="px-3 py-3">Spend</th><th className="px-3 py-3">Bookings</th><th className="px-3 py-3">Revenue</th><th className="px-3 py-3">CPA</th><th className="px-3 py-3">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.channels.map((row) => (
                  <tr key={row.channel}>
                    <td className="px-3 py-2">{CHANNEL_LABEL[row.channel]}</td>
                    <td className="px-3 py-2">{money(row.spend)}</td>
                    <td className="px-3 py-2">{row.bookings}</td>
                    <td className="px-3 py-2">{money(row.revenue)}</td>
                    <td className="px-3 py-2">{money(row.cpa)}</td>
                    <td className="px-3 py-2">{row.roas.toFixed(2)}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Funnel metrics</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <FunnelStat label="Visitors" value={data.funnel.visitors} pct={100} />
                <FunnelStat label="Started booking" value={data.funnel.started} pct={data.funnelConversion.visitToStartPct} />
                <FunnelStat label="Viewed price" value={data.funnel.viewedPrice} pct={data.funnelConversion.startToPricePct} />
                <FunnelStat label="Selected time" value={data.funnel.selectedTime} pct={data.funnelConversion.priceToTimePct} />
                <FunnelStat label="Completed booking" value={data.funnel.completed} pct={data.funnelConversion.timeToCompletePct} />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">ROI analysis</h2>
              <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <p>Profit: <span className="font-semibold">{money(data.roi.profit)}</span></p>
                <p>Best performing channel: <span className="font-semibold">{data.roi.bestChannel ? CHANNEL_LABEL[data.roi.bestChannel] : "—"}</span></p>
                <p>Worst performing channel: <span className="font-semibold">{data.roi.worstChannel ? CHANNEL_LABEL[data.roi.worstChannel] : "—"}</span></p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Revenue vs spend</h2>
              <svg viewBox="0 0 560 220" className="mt-3 h-52 w-full">
                <polyline
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="3"
                  points={data.charts.revenueVsSpend.map((d, i) => `${(i / Math.max(1, data.charts.revenueVsSpend.length - 1)) * 540 + 10},${200 - (d.revenue / maxTrendValue) * 170}`).join(" ")}
                />
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  points={data.charts.revenueVsSpend.map((d, i) => `${(i / Math.max(1, data.charts.revenueVsSpend.length - 1)) * 540 + 10},${200 - (d.spend / maxTrendValue) * 170}`).join(" ")}
                />
              </svg>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Bookings per channel</h2>
              <div className="mt-3 space-y-2">
                {data.charts.bookingsPerChannel.map((row) => (
                  <div key={row.channel} className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300">
                      <span>{CHANNEL_LABEL[row.channel]}</span>
                      <span>{row.bookings}</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(6, (row.bookings / maxBar) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Campaign insights</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
              {data.insights.length === 0 ? <li>No insights yet.</li> : data.insights.map((ins) => <li key={ins} className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">{ins}</li>)}
            </ul>
          </section>
        </>
      ) : null}

      {toast ? <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">{toast}</div> : null}
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function FunnelStat({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/60">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xs text-zinc-400">{pct.toFixed(1)}%</p>
    </div>
  );
}
