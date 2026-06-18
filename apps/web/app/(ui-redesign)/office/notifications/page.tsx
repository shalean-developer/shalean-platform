"use client";

import { useState } from "react";
import { Bell, Mail, MessageSquare, Send, Plus, Search, CheckCircle2, AlertTriangle, Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const CHANNEL_STATS = [
  { channel: "Email", icon: Mail, color: "bg-blue-50 text-blue-600", sent: 48, failed: 2, successRate: 96 },
  { channel: "WhatsApp", icon: MessageSquare, color: "bg-emerald-50 text-emerald-600", sent: 0, failed: 0, successRate: null },
  { channel: "SMS", icon: Bell, color: "bg-violet-50 text-violet-600", sent: 12, failed: 0, successRate: 100 },
];

const RECENT_LOGS = [
  { id: "NL-0091", type: "Booking Confirmation", channel: "email", recipient: "Sarah Johnson", status: "delivered", time: "09:06" },
  { id: "NL-0090", type: "Booking Reminder (24h)", channel: "whatsapp", recipient: "Mark Williams", status: "failed", time: "09:00" },
  { id: "NL-0089", type: "Payment Receipt", channel: "email", recipient: "Priya Naidoo", status: "delivered", time: "08:55" },
  { id: "NL-0088", type: "Cleaner Assigned", channel: "sms", recipient: "Ayesha Hendricks", status: "delivered", time: "08:50" },
];

export default function NotificationsPage() {
  const [tab, setTab] = useState<"overview" | "send">("overview");
  const [recipientType, setRecipientType] = useState("all_customers");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("email");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage customer and cleaner notification delivery across all channels.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {(["overview", "send"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                tab === t ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700")}>
              {t === "overview" ? "Overview" : "Send notification"}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <>
          {/* Channel stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            {CHANNEL_STATS.map((c) => {
              const CIcon = c.icon;
              return (
                <div key={c.channel} className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
                  <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl", c.color)}>
                    <CIcon className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.channel}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800">{c.sent}</p>
                  <p className="text-xs text-slate-400">Delivered today</p>
                  {c.failed > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> {c.failed} failed
                    </div>
                  )}
                  {c.successRate !== null && (
                    <p className="mt-1 text-xs font-semibold text-emerald-600">{c.successRate}% success rate</p>
                  )}
                  {c.successRate === null && (
                    <p className="mt-1 text-xs text-slate-400">No messages today</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recent delivery logs */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-sm font-bold text-slate-800">Recent delivery logs</h3>
              <a href="/office/notification-logs" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
                View all <ChevronRight className="h-3 w-3" />
              </a>
            </div>
            <div className="divide-y divide-slate-50">
              {RECENT_LOGS.map((l) => (
                <div key={l.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="text-xs font-mono text-slate-400 w-10 shrink-0">{l.time}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{l.type}</p>
                    <p className="text-xs text-slate-400">{l.recipient} · {l.channel}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    l.status === "delivered" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                    {l.status === "delivered" ? "Delivered" : "Failed"}
                  </span>
                  {l.status === "failed" && (
                    <button type="button" className="shrink-0 text-xs font-bold text-blue-600 hover:underline">Retry</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm max-w-2xl">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Send a notification</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Channel</label>
              <div className="flex gap-2">
                {["email", "sms", "whatsapp"].map((ch) => (
                  <button key={ch} type="button" onClick={() => setChannel(ch)}
                    className={cn("rounded-xl border px-4 py-2 text-sm font-semibold capitalize transition-colors",
                      channel === ch ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                    {ch}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Recipients</label>
              <select value={recipientType} onChange={e => setRecipientType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-300">
                <option value="all_customers">All customers</option>
                <option value="all_cleaners">All cleaners</option>
                <option value="bookings_today">Customers with bookings today</option>
                <option value="unassigned">Customers with unassigned bookings</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Message</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                placeholder="Type your message here…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-300 resize-none" />
              <p className="mt-1 text-right text-xs text-slate-400">{message.length} / 500</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Preview
              </button>
              <button type="button" className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm">
                <Send className="h-4 w-4" /> Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
