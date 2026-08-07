"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, RefreshCw, Send, Search, UserRound, Clock3 } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";

type InboxMessage = {
  id: string;
  provider: string;
  phone: string | null;
  direction: "inbound" | "outbound";
  body: string;
  templateName: string | null;
  messageId: string | null;
  adminEmail: string | null;
  createdAt: string;
};

type Contact = { name: string | null; bookingId: string | null; bookingReference: string | null };
type ConversationState = { latestInboundAt: string | null; conversationOpen: boolean };
type Template = { key: string; metaTemplateName: string; language: string; variables: string[]; body: string; category: string };
type InboxResponse = {
  messages: InboxMessage[];
  contacts: Record<string, Contact>;
  conversationState: Record<string, ConversationState>;
  approvedCustomerTemplates: Template[];
};

function digits(value: string | null | undefined) { return String(value ?? "").replace(/\D/g, ""); }

export function WhatsAppInbox() {
  const [data, setData] = useState<InboxResponse>({ messages: [], contacts: {}, conversationState: {}, approvedCustomerTemplates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState("");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateParams, setTemplateParams] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const selectedPhoneRef = useRef("");

  useEffect(() => { selectedPhoneRef.current = selectedPhone; }, [selectedPhone]);

  async function load(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    const result = await adminFetch<InboxResponse>("/api/admin/whatsapp-inbox?limit=1000");
    if (!silent) setLoading(false);
    if (!result.ok) {
      if (!silent) setError(result.error ?? "Failed to load WhatsApp inbox.");
      return;
    }
    const next = result.data ?? { messages: [], contacts: {}, conversationState: {}, approvedCustomerTemplates: [] };
    setData(next);
    if (!selectedPhoneRef.current) {
      const first = next.messages.map((m) => digits(m.phone)).find(Boolean);
      if (first) setSelectedPhone(first);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let pollInFlight = false;

    const schedule = () => {
      if (cancelled) return;
      timer = globalThis.setTimeout(() => { void poll(); }, 3000);
    };

    const poll = async () => {
      if (cancelled || pollInFlight) return;
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      pollInFlight = true;
      try {
        await load({ silent: true });
      } finally {
        pollInFlight = false;
        schedule();
      }
    };

    void (async () => {
      await load();
      schedule();
    })();

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) globalThis.clearTimeout(timer);
      timer = null;
      void poll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) globalThis.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const conversations = useMemo(() => {
    const map = new Map<string, InboxMessage[]>();
    for (const message of data.messages) {
      const phone = digits(message.phone);
      if (!phone) continue;
      const list = map.get(phone) ?? [];
      list.push(message);
      map.set(phone, list);
    }
    return [...map.entries()]
      .map(([phone, rawMessages]) => {
        const messages = [...rawMessages].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        return { phone, messages, latest: messages[messages.length - 1] };
      })
      .filter((item) => Boolean(item.latest))
      .sort((a, b) => +new Date(b.latest.createdAt) - +new Date(a.latest.createdAt));
  }, [data.messages]);

  const filtered = conversations.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const contact = data.contacts[c.phone];
    return c.phone.includes(q) || String(contact?.name ?? "").toLowerCase().includes(q) || String(contact?.bookingReference ?? "").toLowerCase().includes(q);
  });
  const selected = conversations.find((c) => c.phone === selectedPhone) ?? null;
  const contact = selectedPhone ? data.contacts[selectedPhone] : null;
  const state = selectedPhone ? data.conversationState[selectedPhone] : null;
  const chosenTemplate = data.approvedCustomerTemplates.find((t) => t.metaTemplateName === templateName) ?? null;

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [selectedPhone, selected?.messages.length]);

  async function sendReply() {
    if (!selectedPhone) return;
    setSending(true);
    setSendError(null);
    const isText = Boolean(state?.conversationOpen);
    const textBody = reply.trim();
    const templateValues = templateParams.split("\n").map((v) => v.trim()).filter(Boolean);
    const result = await adminFetch<{ ok: boolean; messageId?: string | null; adminEmail?: string | null; createdAt?: string }>("/api/admin/whatsapp-inbox/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isText
        ? { phone: selectedPhone, mode: "text", message: textBody }
        : { phone: selectedPhone, mode: "template", templateName, language: chosenTemplate?.language ?? "en", bodyParams: templateValues }),
    });
    setSending(false);
    if (!result.ok) {
      setSendError(result.error ?? "WhatsApp reply failed.");
      return;
    }

    const sentAt = result.data?.createdAt ?? new Date().toISOString();
    const sentBody = isText
      ? textBody
      : chosenTemplate
        ? chosenTemplate.body.replace(/\{\{(\d+)\}\}/g, (_match, n: string) => templateValues[Number(n) - 1] ?? `{{${n}}}`)
        : "[Template message]";
    const optimistic: InboxMessage = {
      id: result.data?.messageId ? `outbound:${result.data.messageId}` : `outbound:${Date.now()}`,
      provider: "meta",
      phone: selectedPhone,
      direction: "outbound",
      body: sentBody,
      templateName: isText ? null : (chosenTemplate?.metaTemplateName ?? templateName),
      messageId: result.data?.messageId ?? null,
      adminEmail: result.data?.adminEmail ?? null,
      createdAt: sentAt,
    };
    setData((current) => ({ ...current, messages: [optimistic, ...current.messages.filter((m) => m.messageId !== optimistic.messageId || !optimistic.messageId)] }));
    setReply("");
    setTemplateParams("");
    globalThis.setTimeout(() => void load({ silent: true }), 600);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600"><Inbox className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">WhatsApp Inbox</h2>
            <p className="text-xs text-slate-500">Live customer conversations through Meta. New messages appear automatically.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error ? <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}

      <div className="grid min-h-[560px] md:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-r border-slate-100 bg-slate-50/40">
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-300" />
            </div>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {!loading && filtered.length === 0 ? <div className="px-4 py-10 text-center text-sm text-slate-400">No WhatsApp conversations yet.</div> : null}
            {filtered.map((conversation) => {
              const c = data.contacts[conversation.phone];
              const latest = conversation.latest;
              return (
                <button key={conversation.phone} type="button" onClick={() => { setSelectedPhone(conversation.phone); setSendError(null); }} className={`w-full border-t border-slate-100 px-4 py-3 text-left hover:bg-white ${selectedPhone === conversation.phone ? "bg-white" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-emerald-50 p-2 text-emerald-600"><UserRound className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{c?.name || conversation.phone}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{new Date(latest.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      {c?.name ? <p className="text-[11px] text-slate-400">+{conversation.phone}</p> : null}
                      <p className="mt-1 truncate text-xs text-slate-500">{latest.direction === "outbound" ? "You: " : ""}{latest.body || "[WhatsApp message]"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a WhatsApp conversation.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2"><h3 className="font-semibold text-slate-900">{contact?.name || `+${selected.phone}`}</h3><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">META</span></div>
                  <p className="text-xs text-slate-500">+{selected.phone}{contact?.bookingReference ? ` · Booking ${contact.bookingReference}` : ""}</p>
                </div>
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${state?.conversationOpen ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <Clock3 className="h-3.5 w-3.5" /> {state?.conversationOpen ? "24-hour reply window open" : "Template required"}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/40 p-4 max-h-[470px]">
                {selected.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm ${message.direction === "outbound" ? "bg-emerald-600 text-white" : "border border-slate-100 bg-white text-slate-800"}`}>
                      {message.templateName ? <p className={`mb-1 text-[10px] font-semibold ${message.direction === "outbound" ? "text-emerald-100" : "text-slate-400"}`}>Template: {message.templateName}</p> : null}
                      <p className="whitespace-pre-wrap break-words text-sm">{message.body || "[Non-text WhatsApp message]"}</p>
                      <div className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${message.direction === "outbound" ? "text-emerald-100" : "text-slate-400"}`}>
                        {message.direction === "outbound" ? <span>{message.adminEmail ? `Sent by ${message.adminEmail}` : "Sent by Shalean"}</span> : null}<span>{new Date(message.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>

              <div className="border-t border-slate-100 p-4">
                {state?.conversationOpen ? (
                  <div className="flex items-end gap-2">
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={1000} placeholder="Type a reply…" className="min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-300" />
                    <button type="button" onClick={() => void sendReply()} disabled={sending || !reply.trim()} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Send</button>
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Approved customer template</label>
                      <select value={templateName} onChange={(e) => { setTemplateName(e.target.value); setTemplateParams(""); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300">
                        <option value="">Select template…</option>
                        {data.approvedCustomerTemplates.map((t) => <option key={t.key} value={t.metaTemplateName}>{t.metaTemplateName}</option>)}
                      </select>
                      {chosenTemplate ? <p className="mt-2 text-xs leading-5 text-slate-500">{chosenTemplate.body}</p> : null}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Body parameters — one per line</label>
                      <textarea value={templateParams} onChange={(e) => setTemplateParams(e.target.value)} rows={3} placeholder={chosenTemplate?.variables.join("\n") || "Select a template"} className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-300" />
                      {chosenTemplate ? <p className="mt-1 text-[11px] text-slate-400">Required: {chosenTemplate.variables.map((v, i) => `{{${i + 1}}} ${v}`).join(" · ")}</p> : null}
                    </div>
                    <button type="button" onClick={() => void sendReply()} disabled={sending || !chosenTemplate} className="lg:col-span-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Send approved template</button>
                  </div>
                )}
                {sendError ? <p className="mt-2 text-sm text-red-600">{sendError}</p> : null}
                <p className="mt-2 text-[11px] text-slate-400">Free-text replies are only allowed within 24 hours of the customer’s latest inbound WhatsApp message. Outside that window, Shalean requires an approved Meta template.</p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
