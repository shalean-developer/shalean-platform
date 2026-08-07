"use client";

import { useEffect, useState } from "react";
import { Inbox, RefreshCw, MessageSquare } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";

type InboxMessage = {
  id: string;
  provider: string;
  phone: string | null;
  body: string;
  messageId: string | null;
  createdAt: string;
};

export function WhatsAppInbox() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await adminFetch<{ messages: InboxMessage[] }>("/api/admin/whatsapp-inbox?limit=50");
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to load WhatsApp inbox.");
      return;
    }
    setMessages(result.data?.messages ?? []);
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600"><Inbox className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">WhatsApp Inbox</h2>
            <p className="text-xs text-slate-500">Inbound messages received by Shalean through Meta.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error ? <div className="px-4 py-3 text-sm text-red-600">{error}</div> : null}

      <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
        {!loading && messages.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">No inbound WhatsApp messages yet.</div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex gap-3 px-4 py-3 hover:bg-slate-50/60">
              <div className="mt-0.5 rounded-full bg-emerald-50 p-2 text-emerald-600"><MessageSquare className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-slate-900">{message.phone || "Unknown contact"}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{message.provider}</span>
                  <span className="text-[11px] text-slate-400">{new Date(message.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{message.body || "[Non-text WhatsApp message]"}</p>
                {message.messageId ? <p className="mt-1 truncate font-mono text-[10px] text-slate-400" title={message.messageId}>{message.messageId}</p> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
