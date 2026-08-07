"use client";

import { useState } from "react";
import { MessageSquare, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";

type SendResult = {
  ok?: boolean;
  provider?: string;
  error?: string;
  queue?: {
    id?: string;
    status?: string;
    provider?: string;
    provider_message_id?: string | null;
    meta_message_id?: string | null;
    delivery_status?: string | null;
    last_error?: string | null;
    phone_e164?: string | null;
  } | null;
};

export function WhatsAppTestSendCard({ onSent }: { onSent?: () => void }) {
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<"text" | "template">("text");
  const [message, setMessage] = useState("Shalean WhatsApp test message");
  const [templateName, setTemplateName] = useState("");
  const [language, setLanguage] = useState("en");
  const [bodyParams, setBodyParams] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function handleSend() {
    setSending(true);
    setResult(null);
    const response = await adminFetch<SendResult>("/api/admin/whatsapp-test", {
      method: "POST",
      body: JSON.stringify({
        phone,
        mode,
        message,
        templateName,
        language,
        bodyParams: bodyParams
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    });
    setSending(false);
    if (!response.ok) {
      setResult({ ok: false, error: response.error || "WhatsApp test failed." });
      return;
    }
    setResult((response.data ?? { ok: true }) as SendResult);
    onSent?.();
  }

  const canSend = Boolean(phone.trim()) && (mode === "text" ? Boolean(message.trim()) : Boolean(templateName.trim()));

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Send WhatsApp Test</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Admin-only test through the configured WhatsApp provider and production queue.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          Uses WHATSAPP_PROVIDER
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Phone number
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+27 76 700 3257"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-300"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Message type
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value === "template" ? "template" : "text")}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-300"
            >
              <option value="text">Text (24-hour conversation window)</option>
              <option value="template">Approved template</option>
            </select>
          </label>
        </div>

        {mode === "text" ? (
          <label className="text-xs font-semibold text-slate-600">
            Test message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-300"
            />
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              Approved template name
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="booking_confirmation"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-300"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Language
              <input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-300"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-3">
              Body parameters — one per line
              <textarea
                value={bodyParams}
                onChange={(event) => setBodyParams(event.target.value)}
                rows={3}
                placeholder={"Farai\nSHL-1234\n8 Aug 2026"}
                className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-blue-300"
              />
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !canSend}
          className="flex h-10 items-center justify-center gap-2 self-end rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-[140px]"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending…" : "Send test"}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
            result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>
            <p className="font-semibold">
              {result.ok ? `Sent via ${result.provider ?? result.queue?.provider ?? "configured provider"}` : result.error ?? "WhatsApp test failed."}
            </p>
            {result.queue ? (
              <p className="mt-0.5 text-[11px] opacity-80">
                Queue {result.queue.id?.slice(0, 8) ?? "—"} · {result.queue.delivery_status ?? result.queue.status ?? "unknown"}
                {result.queue.provider_message_id || result.queue.meta_message_id
                  ? ` · message ${result.queue.provider_message_id ?? result.queue.meta_message_id}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
