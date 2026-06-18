"use client";

import { useState } from "react";
import { Megaphone, TrendingUp, Link2, Eye, MousePointer, DollarSign, Plus, Edit2, Pause, Play, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

type CampaignStatus = "active" | "paused" | "completed" | "draft";

const STATUS_MAP: Record<CampaignStatus, { label: string; cls: string }> = {
  active:    { label: "Active",    cls: "bg-emerald-100 text-emerald-700" },
  paused:    { label: "Paused",    cls: "bg-orange-100 text-orange-700" },
  completed: { label: "Completed", cls: "bg-blue-100 text-blue-700" },
  draft:     { label: "Draft",     cls: "bg-slate-100 text-slate-600" },
};

const CAMPAIGNS = [
  { id: "C-001", name: "Cape Town Spring Promo", channel: "Google Ads", spend: "R 3 200", clicks: 842, conversions: 12, revenue: "R 9 360", status: "active" as CampaignStatus, utm: "utm_campaign=spring_promo&utm_source=google" },
  { id: "C-002", name: "Facebook Deep Clean Offer", channel: "Facebook Ads", spend: "R 1 800", clicks: 612, conversions: 8, revenue: "R 10 000", status: "active" as CampaignStatus, utm: "utm_campaign=deep_clean&utm_source=fb" },
  { id: "C-003", name: "WhatsApp Referral Drive", channel: "WhatsApp", spend: "R 0", clicks: 215, conversions: 5, revenue: "R 3 900", status: "paused" as CampaignStatus, utm: "utm_campaign=referral&utm_source=whatsapp" },
  { id: "C-004", name: "End of Year Blitz", channel: "Email", spend: "R 500", clicks: 320, conversions: 14, revenue: "R 10 920", status: "completed" as CampaignStatus, utm: "utm_campaign=eoy_blitz&utm_source=email" },
];

const LEAD_SOURCES = [
  { source: "Organic search", pct: 38, bookings: 15 },
  { source: "Google Ads", pct: 24, bookings: 9 },
  { source: "Facebook Ads", pct: 18, bookings: 7 },
  { source: "Referrals", pct: 13, bookings: 5 },
  { source: "Direct", pct: 7, bookings: 3 },
];

export default function MarketingPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketing</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage campaigns, track UTM performance and monitor lead sources.</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total ad spend", value: "R 5 500", icon: DollarSign, color: "bg-red-50 text-red-600" },
          { label: "Total clicks", value: "1 989", icon: MousePointer, color: "bg-blue-50 text-blue-600" },
          { label: "Total conversions", value: "39", icon: TrendingUp, color: "bg-emerald-50 text-emerald-600" },
          { label: "Total revenue", value: "R 34 180", icon: BarChart3, color: "bg-violet-50 text-violet-600" },
        ].map((k) => {
          const KIcon = k.icon;
          const [iconBg, iconColor] = k.color.split(" ");
          return (
            <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800">{k.value}</p>
                </div>
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconBg)}>
                  <KIcon className={cn("h-4 w-4", iconColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-800">Campaigns</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["Campaign", "Channel", "Spend", "Clicks", "Conv.", "Revenue", "Status", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {CAMPAIGNS.map((c) => {
                  const s = STATUS_MAP[c.status];
                  return (
                    <tr key={c.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                        <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{c.utm}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{c.channel}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{c.spend}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{c.clicks.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{c.conversions}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-800">{c.revenue}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit2 className="h-3.5 w-3.5" /></button>
                          {c.status === "active"
                            ? <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-600"><Pause className="h-3.5 w-3.5" /></button>
                            : <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><Play className="h-3.5 w-3.5" /></button>
                          }
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Lead sources</h3>
          <div className="space-y-3">
            {LEAD_SOURCES.map((s) => (
              <div key={s.source}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-700">{s.source}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{s.bookings} bookings</span>
                    <span className="text-xs font-bold text-slate-700">{s.pct}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
