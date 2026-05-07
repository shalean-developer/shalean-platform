"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { AdminReferralRow } from "@/lib/admin/referralsReadModel.types";
import type {
  ReferralLeaderboardRow,
  ReferralsDashboardExtras,
} from "@/lib/admin/referralsDashboardExtras.types";

type CheckoutDiscountRow = {
  referralCode: string;
  redemptionCount: number;
  totalDiscountZar: number;
};

function formatMonthBucket(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
}

function LeaderboardTable({
  title,
  subtitle,
  rows,
  emphasize,
}: {
  title: string;
  subtitle?: string;
  rows: ReferralLeaderboardRow[];
  emphasize?: "contribution" | "gross" | "conversion";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h4>
      {subtitle ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p> : null}
      <ul className="mt-3 space-y-2 text-xs">
        {rows.length === 0 ? (
          <li className="text-zinc-500">No data yet.</li>
        ) : (
          rows.map((r, i) => (
            <li key={`${r.referrerType}-${r.referrerId}-${i}`} className="flex flex-col gap-0.5 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-zinc-800 dark:text-zinc-100">{r.displayLabel}</span>
                <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {r.referrerType}
                </span>
              </div>
              <div className="space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                {emphasize === "contribution" ? (
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Est. contribution R {r.estimatedNetContributionZar.toLocaleString("en-ZA")}
                  </div>
                ) : null}
                {emphasize === "gross" ? (
                  <div className="font-semibold text-zinc-800 dark:text-zinc-100">
                    Gross R {r.grossReferredRevenueZar.toLocaleString("en-ZA")}
                  </div>
                ) : null}
                {emphasize === "conversion" && r.conversionRate != null ? (
                  <div className="font-semibold text-indigo-700 dark:text-indigo-400">
                    Conv. {(100 * r.conversionRate).toFixed(1)}% ({r.conversionsCompleted}/{r.attributedBookings}{" "}
                    attributed bookings)
                  </div>
                ) : null}
                <div>
                  {emphasize !== "gross" ? <>Gross R {r.grossReferredRevenueZar.toLocaleString("en-ZA")} · </> : null}
                  {emphasize !== "contribution" ? (
                    <>Contribution R {r.estimatedNetContributionZar.toLocaleString("en-ZA")} · </>
                  ) : null}
                  Conv.{" "}
                  {r.conversionRate != null ? `${(100 * r.conversionRate).toFixed(1)}%` : "—"}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default function AdminReferralsPage() {
  const [rows, setRows] = useState<AdminReferralRow[]>([]);
  const [checkoutDiscounts, setCheckoutDiscounts] = useState<CheckoutDiscountRow[]>([]);
  const [dashboard, setDashboard] = useState<ReferralsDashboardExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const sb = getSupabaseBrowser();
      const session = await sb?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        if (active) {
          setError("Please sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/referrals", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as {
        referrals?: AdminReferralRow[];
        checkoutDiscounts?: CheckoutDiscountRow[];
        dashboard?: ReferralsDashboardExtras;
        error?: string;
      };
      if (!active) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load referrals.");
        setLoading(false);
        return;
      }
      setRows(json.referrals ?? []);
      setCheckoutDiscounts(json.checkoutDiscounts ?? []);
      setDashboard(json.dashboard ?? null);
      setLoading(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <section>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Referrals</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Reward lifecycle plus referrer checkout analytics (rolled up per referrer).
        </p>
      </section>

      {dashboard && !error ? (
        <>
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Leaderboards</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <LeaderboardTable
                title="Top referrers — est. net contribution"
                subtitle="Attribution economics (v1); not full profit."
                rows={dashboard.leaderboards.topByEstimatedContribution}
                emphasize="contribution"
              />
              <LeaderboardTable
                title="Top by attributed gross revenue"
                rows={dashboard.leaderboards.topByGrossRevenue}
                emphasize="gross"
              />
              <LeaderboardTable
                title="Top customers — contribution"
                rows={dashboard.leaderboards.topCustomersByContribution}
                emphasize="contribution"
              />
              <LeaderboardTable
                title="Top cleaners — contribution"
                rows={dashboard.leaderboards.topCleanersByContribution}
                emphasize="contribution"
              />
              <LeaderboardTable
                title="Highest conversion vs attributed bookings"
                subtitle="Requires at least 2 attributed checkout bookings (lifecycle conversions ÷ attributed)."
                rows={dashboard.leaderboards.topByConversionRate}
                emphasize="conversion"
              />
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Monthly platform economics</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Sum of per-referrer monthly attribution economics (UTC calendar months).
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-3 py-3">Month</th>
                    <th className="px-3 py-3">Gross revenue</th>
                    <th className="px-3 py-3">Discounts</th>
                    <th className="px-3 py-3">Rewards</th>
                    <th className="px-3 py-3">Est. contribution</th>
                    <th className="px-3 py-3">Paid bookings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {dashboard.monthlyEconomics.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-zinc-500">
                        No monthly economics yet.
                      </td>
                    </tr>
                  ) : (
                    dashboard.monthlyEconomics.map((m) => (
                      <tr key={m.monthBucket}>
                        <td className="px-3 py-2">{formatMonthBucket(m.monthBucket)}</td>
                        <td className="px-3 py-2">R {m.grossReferredRevenueZar.toLocaleString("en-ZA")}</td>
                        <td className="px-3 py-2">R {m.totalDiscountCostZar.toLocaleString("en-ZA")}</td>
                        <td className="px-3 py-2">R {m.totalRewardCostZar.toLocaleString("en-ZA")}</td>
                        <td
                          className={
                            m.estimatedNetContributionZar >= 0
                              ? "px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-400"
                              : "px-3 py-2 font-semibold text-rose-700 dark:text-rose-400"
                          }
                        >
                          R {m.estimatedNetContributionZar.toLocaleString("en-ZA")}
                        </td>
                        <td className="px-3 py-2">{m.profitableBookingCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Redemption spike hints</h4>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Current month redemptions vs trailing 3-month average — heuristic review only.
              </p>
              {dashboard.spikeFlags.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500">No flags this period.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-xs">
                  {dashboard.spikeFlags.map((s) => (
                    <li key={`${s.referrerType}-${s.referrerId}`} className="border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                      <div className="font-medium text-zinc-800 dark:text-zinc-100">{s.displayLabel}</div>
                      <div className="text-zinc-600 dark:text-zinc-400">
                        This month {s.currentMonthRedemptions} · avg prior 3 mo {s.avgPrior3MonthsRedemptions.toFixed(1)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">High reward / gross ratio</h4>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Rewards ÷ attributed gross revenue — review economics quality.
              </p>
              {dashboard.qualityHighRewardBurden.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500">No rows yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-xs">
                  {dashboard.qualityHighRewardBurden.map((q) => (
                    <li key={`${q.referrerType}-${q.referrerId}`} className="border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                      <div className="font-medium text-zinc-800 dark:text-zinc-100">{q.displayLabel}</div>
                      <div className="text-zinc-600 dark:text-zinc-400">
                        Ratio {q.rewardToGrossRevenueRatio != null ? q.rewardToGrossRevenueRatio.toFixed(3) : "—"} · gross R{" "}
                        {q.grossReferredRevenueZar?.toLocaleString("en-ZA") ?? "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <tr>
              <th className="px-3 py-3">Referrer</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Referred</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Reward</th>
              <th className="px-3 py-3">Checkout analytics</th>
              <th className="px-3 py-3">Dates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-zinc-500">
                  Loading referrals...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-rose-700">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-zinc-500">
                  No referrals yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[280px] px-3 py-2">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">{r.referrer.displayLabel}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {r.referrer.type}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {r.referred.emailOrPhone ?? "—"}
                    {r.referred.userId ? (
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-400">{r.referred.userId.slice(0, 8)}…</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        r.lifecycle.status === "completed" || r.lifecycle.status === "rewarded"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                      ].join(" ")}
                    >
                      {r.lifecycle.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    R {Number(r.lifecycle.rewardAmount ?? 0).toLocaleString("en-ZA")}
                  </td>
                  <td className="min-w-[300px] px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <div className="font-semibold text-zinc-500 dark:text-zinc-500">Checkout</div>
                    <div>R {r.analytics.totalCheckoutDiscountsZar.toLocaleString("en-ZA")} discount liability</div>
                    <div>{r.analytics.redemptionCount} checkout redemptions</div>
                    <div>{r.analytics.attributedBookings} attributed bookings (events)</div>
                    {r.referrer.type === "cleaner" ? (
                      <div>{r.analytics.cleanerCheckoutAttributionCount} cleaner attribution events</div>
                    ) : null}
                    <div className="mt-2 border-t border-zinc-200 pt-2 font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
                      Lifecycle
                    </div>
                    <div>
                      {r.analytics.conversionsCompleted} conversions · {r.analytics.distinctRefereeCount} distinct referees
                    </div>
                    {r.analytics.latestConversionAt ? (
                      <div className="text-[11px]">
                        Last conversion {new Date(r.analytics.latestConversionAt).toLocaleString("en-ZA")}
                      </div>
                    ) : null}
                    <div>
                      {r.analytics.rewardsCreditedCount} rewards credited · R{" "}
                      {r.analytics.totalRewardsZar.toLocaleString("en-ZA")} settled
                      {r.analytics.avgRewardZar != null ? (
                        <span> (avg R {r.analytics.avgRewardZar.toLocaleString("en-ZA")})</span>
                      ) : null}
                    </div>
                    {r.analytics.latestRewardAt ? (
                      <div className="text-[11px]">
                        Last reward {new Date(r.analytics.latestRewardAt).toLocaleString("en-ZA")}
                      </div>
                    ) : null}
                    <div className="mt-2 border-t border-zinc-200 pt-2 font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
                      Economics (estimated)
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-500">
                      Paid bookings with checkout attribution − discounts − rewards (not full profit).
                    </div>
                    <div>
                      Gross attributed revenue R{" "}
                      {r.analytics.profitability.grossReferredRevenueZar.toLocaleString("en-ZA")} ·{" "}
                      {r.analytics.profitability.profitableBookingCount} bookings
                      {r.analytics.profitability.avgBookingValueZar != null ? (
                        <span> (avg R {r.analytics.profitability.avgBookingValueZar.toLocaleString("en-ZA")})</span>
                      ) : null}
                    </div>
                    <div>
                      − R {r.analytics.profitability.totalDiscountCostZar.toLocaleString("en-ZA")} checkout discounts · − R{" "}
                      {r.analytics.profitability.totalRewardCostZar.toLocaleString("en-ZA")} rewards
                    </div>
                    <div
                      className={
                        r.analytics.profitability.estimatedNetContributionZar >= 0
                          ? "font-semibold text-emerald-700 dark:text-emerald-400"
                          : "font-semibold text-rose-700 dark:text-rose-400"
                      }
                    >
                      Est. net contribution R{" "}
                      {r.analytics.profitability.estimatedNetContributionZar.toLocaleString("en-ZA")}
                    </div>
                    {r.analytics.profitability.latestProfitableBookingAt ? (
                      <div className="text-[11px]">
                        Latest attributed paid booking{" "}
                        {new Date(r.analytics.profitability.latestProfitableBookingAt).toLocaleString("en-ZA")}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <div>Created {new Date(r.lifecycle.createdAt).toLocaleDateString("en-ZA")}</div>
                    {r.lifecycle.rewardedAt ? (
                      <div>Rewarded {new Date(r.lifecycle.rewardedAt).toLocaleDateString("en-ZA")}</div>
                    ) : r.lifecycle.completedAt ? (
                      <div>Completed {new Date(r.lifecycle.completedAt).toLocaleDateString("en-ZA")}</div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Checkout referral discounts (Paystack)</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Successful checkout redemptions per code — total discount liability (ZAR).
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
              <tr>
                <th className="px-3 py-3">Code</th>
                <th className="px-3 py-3">Redemptions</th>
                <th className="px-3 py-3">Total discount (ZAR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-zinc-500">
                    Loading…
                  </td>
                </tr>
              ) : error ? null : checkoutDiscounts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-zinc-500">
                    No checkout redemptions yet.
                  </td>
                </tr>
              ) : (
                checkoutDiscounts.map((c) => (
                  <tr key={c.referralCode}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{c.referralCode}</td>
                    <td className="px-3 py-2">{c.redemptionCount}</td>
                    <td className="px-3 py-2">R {Number(c.totalDiscountZar ?? 0).toLocaleString("en-ZA")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
