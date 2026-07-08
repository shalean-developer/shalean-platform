"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Gift,
  HeartHandshake,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Settings,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/hooks/useAdminData";
import { useAdminData } from "@/hooks/useAdminData";
import type { AdminReferralRow } from "@/lib/admin/referralsReadModel.types";
import type { ReferralsDashboardExtras } from "@/lib/admin/referralsDashboardExtras.types";
import type { ReferralProgramSettings } from "@/lib/referrals/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { emitAdminToast } from "@/lib/admin/toastBus";

type StatusFilter = "" | "pending" | "qualified" | "reward_issued" | "expired" | "cancelled";

function mapUiStatus(row: AdminReferralRow): StatusFilter {
  const st = row.lifecycle.status.toLowerCase();
  if (row.lifecycle.rewardedAt || st === "rewarded") return "reward_issued";
  if (st === "completed") return "qualified";
  if (st === "expired") return "expired";
  if (st === "cancelled") return "cancelled";
  return "pending";
}

function statusLabel(f: StatusFilter): string {
  switch (f) {
    case "pending": return "Pending";
    case "qualified": return "Qualified";
    case "reward_issued": return "Reward Issued";
    case "expired": return "Expired";
    case "cancelled": return "Cancelled";
    default: return "All";
  }
}

function statusBadge(f: StatusFilter): string {
  switch (f) {
    case "reward_issued": return "bg-emerald-100 text-emerald-700";
    case "qualified": return "bg-blue-100 text-blue-700";
    case "pending": return "bg-orange-100 text-orange-700";
    case "expired": return "bg-gray-100 text-gray-600";
    case "cancelled": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export function ReferralProgramDashboard() {
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [settings, setSettings] = useState<ReferralProgramSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [campaign, setCampaign] = useState<Record<string, unknown> | null>(null);
  const [campaignStats, setCampaignStats] = useState<Record<string, unknown> | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const { data, loading, error, refetch } = useAdminData<{
    referrals: AdminReferralRow[];
    dashboard: ReferralsDashboardExtras;
    checkoutDiscounts: { referralCode: string; redemptionCount: number; totalDiscountZar: number }[];
  }>("/api/admin/referrals", { params: { referrerType: "customer" } });

  const referrals = data?.referrals ?? [];
  const dashboard = data?.dashboard;

  const loadSettings = useCallback(async () => {
    const res = await adminFetch<{ settings: ReferralProgramSettings }>("/api/admin/referrals/settings");
    if (res.data?.settings) setSettings(res.data.settings);
  }, []);

  const loadCampaign = useCallback(async () => {
    const res = await adminFetch<{ campaign: Record<string, unknown>; stats: Record<string, unknown> }>("/api/admin/referrals/campaigns");
    if (res.data?.campaign) setCampaign(res.data.campaign);
    if (res.data?.stats) setCampaignStats(res.data.stats);
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadCampaign();
  }, [loadSettings, loadCampaign]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return referrals.filter((r) => {
      const ui = mapUiStatus(r);
      if (statusFilter && ui !== statusFilter) return false;
      if (!q) return true;
      return (
        r.referrer.displayLabel.toLowerCase().includes(q) ||
        (r.referrer.referralCode ?? "").toLowerCase().includes(q) ||
        (r.referred.emailOrPhone ?? "").toLowerCase().includes(q)
      );
    });
  }, [referrals, search, statusFilter]);

  const rewardedCount = referrals.filter((r) => mapUiStatus(r) === "reward_issued").length;
  const pendingCount = referrals.filter((r) => mapUiStatus(r) === "pending").length;
  const conversionRate = referrals.length > 0 ? Math.round((rewardedCount / referrals.length) * 100) : 0;
  const rewardsPaidZar = referrals.reduce((s, r) => s + (r.analytics.totalRewardsZar ?? 0), 0);
  const referralRevenueZar = referrals.reduce((s, r) => s + r.analytics.profitability.grossReferredRevenueZar, 0);

  async function saveSettings() {
    if (!settings) return;
    setSettingsSaving(true);
    const res = await adminFetch<{ settings: ReferralProgramSettings }>("/api/admin/referrals/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
    setSettingsSaving(false);
    if (res.data?.settings) {
      setSettings(res.data.settings);
      emitAdminToast("Settings saved.", "success");
    } else {
      emitAdminToast(res.error ?? "Could not save settings.", "error");
    }
  }

  async function referralAction(id: string, action: string, extra?: Record<string, unknown>) {
    setActionBusy(id);
    const res = await adminFetch<{ success?: boolean; error?: string }>(`/api/admin/referrals/${id}/actions`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    });
    setActionBusy(null);
    if (res.data?.success) {
      emitAdminToast("Action completed.", "success");
      void refetch();
    } else {
      emitAdminToast(res.error ?? res.data?.error ?? "Action failed.", "error");
    }
  }

  async function toggleCampaign(enabled: boolean) {
    await adminFetch("/api/admin/referrals/campaigns", {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    void loadCampaign();
    emitAdminToast(enabled ? "Campaign enabled." : "Campaign disabled.", "success");
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) return;
    const res = await adminFetch<{ success?: boolean; error?: string }>("/api/admin/referrals/campaigns", {
      method: "POST",
      body: JSON.stringify({ action: "send_test", testEmail: testEmail.trim() }),
    });
    if (res.data?.success) emitAdminToast("Test email sent.", "success");
    else emitAdminToast(res.error ?? res.data?.error ?? "Send failed.", "error");
  }

  async function sendCampaignNow() {
    const res = await adminFetch<{ sent?: number; skipped?: number; failed?: number }>("/api/admin/referrals/campaigns", {
      method: "POST",
      body: JSON.stringify({ action: "send_now" }),
    });
    emitAdminToast(`Sent ${res.data?.sent ?? 0}, skipped ${res.data?.skipped ?? 0}, failed ${res.data?.failed ?? 0}.`, "success");
    void loadCampaign();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referral Program</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage settings, referrals, reporting, and email campaigns.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} className="rounded-xl">
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg"><BarChart3 className="mr-1.5 h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="management" className="rounded-lg"><HeartHandshake className="mr-1.5 h-4 w-4" />Management</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-lg"><Settings className="mr-1.5 h-4 w-4" />Settings</TabsTrigger>
          <TabsTrigger value="campaigns" className="rounded-lg"><Mail className="mr-1.5 h-4 w-4" />Email Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total referrals", value: loading ? "-" : String(referrals.length), icon: HeartHandshake },
              { label: "Successful", value: loading ? "-" : String(rewardedCount), icon: CheckCircle2 },
              { label: "Pending", value: loading ? "-" : String(pendingCount), icon: TrendingUp },
              { label: "Conversion", value: loading ? "-" : `${conversionRate}%`, icon: BarChart3 },
              { label: "Credit issued", value: loading ? "-" : `R ${Math.round(rewardsPaidZar).toLocaleString("en-ZA")}`, icon: Gift },
              { label: "Referral revenue", value: loading ? "-" : `R ${Math.round(referralRevenueZar).toLocaleString("en-ZA")}`, icon: TrendingUp },
            ].map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <Icon className="mb-2 h-4 w-4 text-violet-600" />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{k.label}</p>
                  <p className="mt-0.5 text-xl font-bold text-slate-800 tabular-nums">{k.value}</p>
                </div>
              );
            })}
          </div>

          {dashboard?.leaderboards.topCustomersByContribution.length ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Top referrers</h3>
              <ul className="mt-3 space-y-2">
                {dashboard.leaderboards.topCustomersByContribution.slice(0, 5).map((r, i) => (
                  <li key={r.referrerId} className="flex items-center justify-between text-sm">
                    <span><span className="mr-2 font-bold text-slate-400">#{i + 1}</span>{r.displayLabel}</span>
                    <span className="font-semibold text-emerald-600">R {Math.round(r.estimatedNetContributionZar).toLocaleString("en-ZA")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {dashboard?.monthlyEconomics?.length ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">Monthly referral trends</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="pb-2">Month</th>
                      <th className="pb-2">Referrals</th>
                      <th className="pb-2">Rewards (R)</th>
                      <th className="pb-2">Discount cost (R)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.monthlyEconomics.slice(0, 6).map((m) => (
                      <tr key={m.monthBucket} className="border-t border-slate-50">
                        <td className="py-2">{m.monthBucket}</td>
                        <td className="py-2">-</td>
                        <td className="py-2">R {Math.round(m.totalRewardCostZar)}</td>
                        <td className="py-2">R {Math.round(m.totalDiscountCostZar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="management" className="mt-4">
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="search"
                placeholder="Search referrals…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-[160px] flex-1 bg-transparent text-sm focus:outline-none"
              />
              <div className="flex flex-wrap gap-1">
                {(["", "pending", "qualified", "reward_issued", "expired", "cancelled"] as StatusFilter[]).map((f) => (
                  <button
                    key={f || "all"}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                      statusFilter === f ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                    )}
                  >
                    {statusLabel(f) || "All"}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">No referrals found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {["Referrer", "Referred", "Date", "Reward", "Status", "Actions"].map((h) => (
                        <th key={h} className="px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map((r) => {
                      const ui = mapUiStatus(r);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-800">{r.referrer.displayLabel}</td>
                          <td className="px-4 py-3 text-slate-600">{r.referred.emailOrPhone ?? "-"}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{formatDate(r.lifecycle.createdAt)}</td>
                          <td className="px-4 py-3 font-semibold">R {r.lifecycle.rewardAmount}</td>
                          <td className="px-4 py-3">
                            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", statusBadge(ui))}>
                              {statusLabel(ui)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {ui === "pending" ? (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionBusy === r.id} onClick={() => void referralAction(r.id, "approve")}>Approve</Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" disabled={actionBusy === r.id} onClick={() => void referralAction(r.id, "reject")}>Reject</Button>
                                </>
                              ) : null}
                              {ui !== "reward_issued" ? (
                                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionBusy === r.id} onClick={() => void referralAction(r.id, "issue_credit")}>Issue credit</Button>
                              ) : (
                                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionBusy === r.id} onClick={() => void referralAction(r.id, "reverse_credit")}>Reverse</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          {settings ? (
            <div className="max-w-2xl space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} className="rounded" />
                <span className="text-sm font-medium">Enable referral program</span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Reward amount (R)</Label><Input type="number" value={settings.rewardAmountZar} onChange={(e) => setSettings({ ...settings, rewardAmountZar: Number(e.target.value) })} /></div>
                <div><Label>Checkout discount (R)</Label><Input type="number" value={settings.checkoutDiscountZar} onChange={(e) => setSettings({ ...settings, checkoutDiscountZar: Number(e.target.value) })} /></div>
                <div><Label>Min booking value (R)</Label><Input type="number" value={settings.minBookingValueZar} onChange={(e) => setSettings({ ...settings, minBookingValueZar: Number(e.target.value) })} /></div>
                <div><Label>Reward expiry (days)</Label><Input type="number" placeholder="No expiry" value={settings.rewardExpiryDays ?? ""} onChange={(e) => setSettings({ ...settings, rewardExpiryDays: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><Label>Max rewards per customer</Label><Input type="number" placeholder="Unlimited" value={settings.maxRewardsPerCustomer ?? ""} onChange={(e) => setSettings({ ...settings, maxRewardsPerCustomer: e.target.value ? Number(e.target.value) : null })} /></div>
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={settings.allowMultipleReferrals} onChange={(e) => setSettings({ ...settings, allowMultipleReferrals: e.target.checked })} className="rounded" />
                <span className="text-sm">Allow multiple referrals per customer</span>
              </label>
              <div><Label>Hero headline</Label><Input value={settings.heroHeadline} onChange={(e) => setSettings({ ...settings, heroHeadline: e.target.value })} /></div>
              <div><Label>Hero subheading</Label><textarea rows={3} className="w-full rounded-xl border px-3 py-2 text-sm" value={settings.heroSubheading} onChange={(e) => setSettings({ ...settings, heroSubheading: e.target.value })} /></div>
              <div><Label>Promotional text</Label><textarea rows={2} className="w-full rounded-xl border px-3 py-2 text-sm" value={settings.promotionalText ?? ""} onChange={(e) => setSettings({ ...settings, promotionalText: e.target.value || null })} /></div>
              <div><Label>Terms & conditions</Label><textarea rows={4} className="w-full rounded-xl border px-3 py-2 text-sm" value={settings.termsAndConditions ?? ""} onChange={(e) => setSettings({ ...settings, termsAndConditions: e.target.value || null })} /></div>
              <Button onClick={() => void saveSettings()} disabled={settingsSaving} className="rounded-xl">
                {settingsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save settings
              </Button>
            </div>
          ) : (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          )}
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Monthly referral email</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean((campaign as { enabled?: boolean })?.enabled)} onChange={(e) => void toggleCampaign(e.target.checked)} />
                Enabled
              </label>
            </div>
            <p className="mt-1 text-sm text-slate-500">Sends once per customer per month. Excludes unsubscribed customers.</p>
            {campaignStats ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Sent", key: "sent" },
                  { label: "Open rate", key: "openRate", suffix: "%" },
                  { label: "Click rate", key: "clickRate", suffix: "%" },
                  { label: "Bounce rate", key: "bounceRate", suffix: "%" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className="text-lg font-bold">{(campaignStats as Record<string, number | null>)[s.key] ?? "-"}{s.suffix ?? ""}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-4 text-xs text-slate-400">
              Placeholders: {"{{first_name}}"}, {"{{referral_link}}"}, {"{{reward_amount}}"}, {"{{available_credit}}"}, {"{{company_name}}"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Input placeholder="Test email address" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="max-w-xs" />
              <Button variant="outline" onClick={() => void sendTestEmail()}>Send test</Button>
              <Button onClick={() => void sendCampaignNow()}>Send campaign now</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
