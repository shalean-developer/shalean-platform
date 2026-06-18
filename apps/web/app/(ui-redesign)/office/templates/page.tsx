"use client";

import { useState } from "react";
import { FileText, Mail, MessageSquare, Bell, Plus, Edit2, Eye, Copy, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Channel = "email" | "sms" | "whatsapp";

const CHANNEL_CONFIG: Record<Channel, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  email:    { label: "Email",    icon: Mail,          color: "bg-blue-50 text-blue-600" },
  sms:      { label: "SMS",      icon: Bell,          color: "bg-violet-50 text-violet-600" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "bg-emerald-50 text-emerald-600" },
};

const TEMPLATES = [
  { id: "TPL-001", name: "Booking Confirmation", channel: "email" as Channel, trigger: "On booking created", status: "active", lastEdited: "2 May 2026" },
  { id: "TPL-002", name: "Booking Reminder (24h)", channel: "whatsapp" as Channel, trigger: "24h before booking", status: "active", lastEdited: "5 May 2026" },
  { id: "TPL-003", name: "Booking Reminder (2h)", channel: "sms" as Channel, trigger: "2h before booking", status: "active", lastEdited: "5 May 2026" },
  { id: "TPL-004", name: "Cleaner Assigned", channel: "email" as Channel, trigger: "On cleaner assignment", status: "active", lastEdited: "1 Apr 2026" },
  { id: "TPL-005", name: "Booking Complete", channel: "whatsapp" as Channel, trigger: "On booking completed", status: "active", lastEdited: "1 Apr 2026" },
  { id: "TPL-006", name: "Review Request", channel: "email" as Channel, trigger: "2h after completion", status: "active", lastEdited: "10 Mar 2026" },
  { id: "TPL-007", name: "Cancellation Notice", channel: "sms" as Channel, trigger: "On booking cancelled", status: "draft", lastEdited: "8 May 2026" },
  { id: "TPL-008", name: "Payout Processed", channel: "email" as Channel, trigger: "On payout sent", status: "draft", lastEdited: "11 May 2026" },
];

export default function TemplatesPage() {
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = TEMPLATES.filter(t => {
    const s = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const c = channel === "all" || t.channel === channel;
    return s && c;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Message Templates</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage email, SMS and WhatsApp notification templates.</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      {/* Channel KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(CHANNEL_CONFIG) as [Channel, typeof CHANNEL_CONFIG[Channel]][]).map(([ch, cfg]) => {
          const CIcon = cfg.icon;
          const count = TEMPLATES.filter(t => t.channel === ch).length;
          return (
            <div key={ch} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <div className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-xl", cfg.color)}>
                <CIcon className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cfg.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{count}</p>
              <p className="text-xs text-slate-400">templates</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300" />
          </div>
          <div className="flex gap-1">
            {(["all", "email", "sms", "whatsapp"] as const).map((ch) => (
              <button key={ch} type="button" onClick={() => setChannel(ch)}
                className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  channel === ch ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100")}>
                {ch === "all" ? "All" : CHANNEL_CONFIG[ch as Channel].label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {filtered.map((t) => {
            const cfg = CHANNEL_CONFIG[t.channel];
            const CIcon = cfg.icon;
            return (
              <div key={t.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 transition-colors group">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", cfg.color)}>
                  <CIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.trigger} · Last edited {t.lastEdited}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold",
                    t.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                    {t.status === "active" ? "Active" : "Draft"}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Eye className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Edit2 className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><Copy className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
