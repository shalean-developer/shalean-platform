"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Copy,
  Gift,
  Loader2,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { emitAdminToast } from "@/lib/admin/toastBus";
import type { PromotionRow, PromotionStatus, PromotionType } from "@/lib/promotions/types";

type AnalyticsPayload = {
  summaries: {
    promotionId: string;
    name: string;
    type: string;
    status: string;
    views: number;
    clicks: number;
    redemptions: number;
    revenueGeneratedZar: number;
    budgetSpentZar: number;
    conversionRate: number;
    roi: number | null;
  }[];
  totals: {
    views: number;
    clicks: number;
    redemptions: number;
    revenueZar: number;
    discountCostZar: number;
  };
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  scheduled: "bg-blue-100 text-blue-700",
  draft: "bg-slate-100 text-slate-600",
  paused: "bg-amber-100 text-amber-800",
  expired: "bg-gray-100 text-gray-600",
  ended: "bg-red-100 text-red-700",
};

function formatZar(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

export function PromotionsAdminDashboard() {
  const [tab, setTab] = useState("promotions");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    promotion_type: "seasonal" as PromotionType,
    discount_type: "percent",
    discount_value: 10,
    promo_code: "",
    auto_apply: false,
    starts_at: "",
    ends_at: "",
    show_on_homepage: true,
    show_on_booking: true,
  });

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter) p.status = statusFilter;
    if (search.trim()) p.search = search.trim();
    return p;
  }, [statusFilter, search]);

  const { data, loading, error, refetch } = useAdminData<{ promotions: PromotionRow[] }>(
    "/api/admin/promotions",
    { params },
  );
  const promotions = data?.promotions ?? [];

  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [memberships, setMemberships] = useState<{
    plans: Record<string, unknown>[];
    stats: { activeMembers: number };
  } | null>(null);
  const [automation, setAutomation] = useState<Record<string, unknown>[]>([]);

  const loadAnalytics = useCallback(async () => {
    const res = await adminFetch<AnalyticsPayload>("/api/admin/promotions/analytics");
    if (res.data) setAnalytics(res.data);
  }, []);

  const loadMemberships = useCallback(async () => {
    const res = await adminFetch<{
      plans: Record<string, unknown>[];
      stats: { activeMembers: number };
    }>("/api/admin/memberships");
    if (res.data) setMemberships(res.data);
  }, []);

  const loadAutomation = useCallback(async () => {
    const res = await adminFetch<{ rules: Record<string, unknown>[] }>("/api/admin/marketing-automation");
    if (res.data?.rules) setAutomation(res.data.rules);
  }, []);

  useEffect(() => {
    void loadAnalytics();
    void loadMemberships();
    void loadAutomation();
  }, [loadAnalytics, loadMemberships, loadAutomation]);

  async function runAction(id: string, action: string) {
    setBusy(`${id}:${action}`);
    const res = await adminFetch(`/api/admin/promotions/${id}`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (res.error) {
      emitAdminToast(res.error, "error");
      return;
    }
    emitAdminToast(`Promotion ${action}d.`, "success");
    void refetch();
    void loadAnalytics();
  }

  async function createPromotion() {
    setBusy("create");
    const res = await adminFetch<{ promotion: PromotionRow }>("/api/admin/promotions", {
      method: "POST",
      body: JSON.stringify({
        name: createForm.name,
        promotion_type: createForm.promotion_type,
        discount_type: createForm.discount_type,
        discount_value: Number(createForm.discount_value),
        promo_code: createForm.promo_code || null,
        auto_apply: createForm.auto_apply,
        starts_at: createForm.starts_at ? new Date(createForm.starts_at).toISOString() : null,
        ends_at: createForm.ends_at ? new Date(createForm.ends_at).toISOString() : null,
        status: createForm.starts_at ? "scheduled" : "draft",
        show_on_homepage: createForm.show_on_homepage,
        show_on_booking: createForm.show_on_booking,
        show_on_pricing: createForm.show_on_homepage,
        show_announcement_bar: createForm.show_on_homepage,
      }),
    });
    setBusy(null);
    if (res.error) {
      emitAdminToast(res.error, "error");
      return;
    }
    emitAdminToast("Promotion created.", "success");
    setShowCreate(false);
    setCreateForm({
      name: "",
      promotion_type: "seasonal",
      discount_type: "percent",
      discount_value: 10,
      promo_code: "",
      auto_apply: false,
      starts_at: "",
      ends_at: "",
      show_on_homepage: true,
      show_on_booking: true,
    });
    void refetch();
  }

  async function toggleAutomation(id: string, enabled: boolean) {
    const res = await adminFetch("/api/admin/marketing-automation", {
      method: "PATCH",
      body: JSON.stringify({ id, enabled }),
    });
    if (res.error) emitAdminToast(res.error, "error");
    else {
      emitAdminToast(enabled ? "Rule enabled." : "Rule paused.", "success");
      void loadAutomation();
    }
  }

  async function exportCsv() {
    const { getSupabaseAccessToken } = await import("@/lib/supabase/browser");
    const token = await getSupabaseAccessToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch("/api/admin/promotions/analytics?format=csv", { headers });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "promotions-analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Promotions & Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, schedule, and measure promotions without code changes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New promotion
          </Button>
        </div>
      </div>

      {analytics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Views", value: analytics.totals.views },
            { label: "Redemptions", value: analytics.totals.redemptions },
            { label: "Revenue attributed", value: formatZar(analytics.totals.revenueZar) },
            { label: "Discount cost", value: formatZar(analytics.totals.discountCostZar) },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{kpi.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="promotions">
            <Megaphone className="mr-1.5 h-4 w-4" /> Promotions
          </TabsTrigger>
          <TabsTrigger value="memberships">
            <Gift className="mr-1.5 h-4 w-4" /> Memberships
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="mr-1.5 h-4 w-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="promotions" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search name, slug, code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <select
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {(["draft", "scheduled", "active", "paused", "expired", "ended"] as PromotionStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Promotion</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Discount</th>
                    <th className="px-4 py-3">Redemptions</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">
                          {p.slug}
                          {p.promo_code ? ` · ${p.promo_code}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 capitalize">{p.promotion_type.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_BADGE[p.status] ?? STATUS_BADGE.draft,
                          )}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.discount_type === "percent"
                          ? `${p.discount_value}%`
                          : p.discount_type === "credit"
                            ? `${formatZar(p.discount_value)} credit`
                            : formatZar(p.discount_value)}
                      </td>
                      <td className="px-4 py-3">{p.redemptions_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.status === "active" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `${p.id}:pause`}
                              onClick={() => void runAction(p.id, "pause")}
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </Button>
                          ) : p.status === "paused" || p.status === "draft" || p.status === "scheduled" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `${p.id}:resume` || busy === `${p.id}:activate`}
                              onClick={() =>
                                void runAction(p.id, p.status === "paused" ? "resume" : "activate")
                              }
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `${p.id}:duplicate`}
                            onClick={() => void runAction(p.id, "duplicate")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {p.status !== "ended" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `${p.id}:end`}
                              onClick={() => void runAction(p.id, "end")}
                            >
                              <Square className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {promotions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No promotions yet. Create one to get started.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {showCreate ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <h2 className="text-lg font-semibold">Create promotion</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={createForm.promotion_type}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        promotion_type: e.target.value as PromotionType,
                      }))
                    }
                  >
                    {[
                      "seasonal",
                      "promo_code",
                      "first_booking",
                      "bundle",
                      "birthday",
                      "custom",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Discount type</Label>
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={createForm.discount_type}
                    onChange={(e) => setCreateForm((f) => ({ ...f, discount_type: e.target.value }))}
                  >
                    <option value="percent">Percent</option>
                    <option value="fixed">Fixed ZAR</option>
                    <option value="credit">Cleaning credit</option>
                  </select>
                </div>
                <div>
                  <Label>Discount value</Label>
                  <Input
                    type="number"
                    value={createForm.discount_value}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, discount_value: Number(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <Label>Promo code (optional)</Label>
                  <Input
                    value={createForm.promo_code}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, promo_code: e.target.value.toUpperCase() }))
                    }
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createForm.auto_apply}
                      onChange={(e) => setCreateForm((f) => ({ ...f, auto_apply: e.target.checked }))}
                    />
                    Auto-apply at checkout
                  </label>
                </div>
                <div>
                  <Label>Starts at</Label>
                  <Input
                    type="datetime-local"
                    value={createForm.starts_at}
                    onChange={(e) => setCreateForm((f) => ({ ...f, starts_at: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Ends at</Label>
                  <Input
                    type="datetime-local"
                    value={createForm.ends_at}
                    onChange={(e) => setCreateForm((f) => ({ ...f, ends_at: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button disabled={busy === "create" || !createForm.name.trim()} onClick={() => void createPromotion()}>
                  {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="memberships" className="space-y-4">
          <p className="text-sm text-slate-600">
            Active members: <strong>{memberships?.stats.activeMembers ?? 0}</strong>
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {(memberships?.plans ?? []).map((plan) => (
              <div key={String(plan.id)} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{String(plan.name)}</p>
                <p className="mt-1 text-sm text-slate-500">{String(plan.description ?? "")}</p>
                <p className="mt-3 text-lg font-bold text-emerald-700">
                  {Number(plan.discount_percent)}% off · {String(plan.billing_frequency)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {plan.enabled ? "Enabled" : "Disabled"} · assign members via API or customer support
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Referrals remain managed under Growth → Referrals. Membership discounts auto-apply at
            booking-v2 checkout for active members.
          </p>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
              Export CSV
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Promotion</th>
                  <th className="px-4 py-3">Views</th>
                  <th className="px-4 py-3">Clicks</th>
                  <th className="px-4 py-3">Redemptions</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">ROI</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.summaries ?? []).map((s) => (
                  <tr key={s.promotionId} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3">{s.views}</td>
                    <td className="px-4 py-3">{s.clicks}</td>
                    <td className="px-4 py-3">{s.redemptions}</td>
                    <td className="px-4 py-3">{formatZar(s.revenueGeneratedZar)}</td>
                    <td className="px-4 py-3">
                      {s.roi == null ? "—" : `${(s.roi * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="automation" className="space-y-3">
          {automation.map((rule) => (
            <div
              key={String(rule.id)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-slate-900">{String(rule.name)}</p>
                <p className="text-xs text-slate-500">
                  Trigger: {String(rule.trigger_event)} · Channel: {String(rule.channel)}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(rule.enabled)}
                  onChange={(e) => void toggleAutomation(String(rule.id), e.target.checked)}
                />
                Enabled
              </label>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
