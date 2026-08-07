"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, MessageSquare, Send } from "lucide-react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";

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
    recipient_role?: string | null;
  } | null;
};

type TemplateItem = {
  key: string;
  audience: "customer" | "cleaner";
  category: "UTILITY" | "MARKETING";
  language: "en";
  variables: readonly string[];
  body: string;
  metaTemplateName: string;
  approvalStatus: "unknown" | "pending" | "approved" | "rejected";
  sendReady: boolean;
};

type ReadinessResponse = {
  templates: TemplateItem[];
};

const SAMPLE_VALUES: Record<string, string> = {
  customer_name: "Farai",
  cleaner_name: "Lucia",
  first_name: "Farai",
  booking_id: "SHL-1234",
  date: "8 Aug 2026",
  time: "09:00",
  price: "R850",
  amount: "R850",
  payment_link: "https://shalean.co.za/book",
  review_link: "https://shalean.co.za/review",
  booking_link: "https://shalean.co.za/book",
  service: "Standard Cleaning",
  location: "Claremont, Cape Town",
  pay: "R250",
  line: "Your Shalean account is ready",
};

function sampleFor(variable: string): string {
  return SAMPLE_VALUES[variable] ?? variable.replaceAll("_", " ");
}

export function WhatsAppTestSendCard() {
  const { data: readiness } = useAdminData<ReadinessResponse>("/api/admin/whatsapp-template-readiness");
  const approvedTemplates = useMemo(
    () => (readiness?.templates ?? []).filter((item) => item.sendReady),
    [readiness?.templates],
  );

  const [phone, setPhone] = useState("");
  const [recipientRole, setRecipientRole] = useState<"customer" | "cleaner">("customer");
  const [mode, setMode] = useState<"text" | "template">("template");
  const [message, setMessage] = useState("Shalean WhatsApp test message");
  const [templateName, setTemplateName] = useState("");
  const [language, setLanguage] = useState("en");
  const [bodyParams, setBodyParams] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const selectedTemplate = useMemo(
    () => approvedTemplates.find((item) => item.metaTemplateName === templateName) ?? null,
    [approvedTemplates, templateName],
  );

  function chooseTemplate(metaTemplateName: string) {
    setTemplateName(metaTemplateName);
    const chosen = approvedTemplates.find((item) => item.metaTemplateName === metaTemplateName);
    if (!chosen) return;
    setRecipientRole(chosen.audience);
    setLanguage(chosen.language);
    setBodyParams(chosen.variables.map((variable) => sampleFor(variable)).join("\n"));
    setResult(null);
  }

  async function handleSend() {
    setSending(true);
    setResult(null);
    const response = await adminFetch<SendResult>("/api/admin/whatsapp-test", {
      method: "POST",
      body: JSON.stringify({
        phone,
        recipientRole,
        mode,
        message,
        templateName,
        language,
        bodyParams: bodyParams.split("\n").map((value) => value.trim()).filter(Boolean),
      }),
    });
    setSending(false);
    if (!response.ok) {
      setResult({ ok: false, error: response.error || "WhatsApp test failed." });
      return;
    }
    setResult((response.data ?? { ok: true }) as SendResult);
  }

  const canSend = Boolean(phone.trim()) && (mode === "text" ? Boolean(message.trim()) : Boolean(templateName.trim()));

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-600"><MessageSquare className="h-5 w-5" /></div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Send WhatsApp Test</h2>
            <p className="mt-0.5 text-sm text-slate-500">Test one approved Meta template at a time before relying on it in production.</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Uses WHATSAPP_PROVIDER</span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Phone number
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 82 123 4567" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-300" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Recipient
          <select value={recipientRole} onChange={(e) => setRecipientRole(e.target.value === "cleaner" ? "cleaner" : "customer")} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-300">
            <option value="customer">Customer</option>
            <option value="cleaner">Cleaner</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Message type
          <select value={mode} onChange={(e) => setMode(e.target.value === "text" ? "text" : "template")} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-300">
            <option value="template">Approved template</option>
            <option value="text">Text (24-hour window)</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Language
          <input value={language} onChange={(e) => setLanguage(e.target.value)} disabled={mode === "template" && Boolean(selectedTemplate)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-300 disabled:bg-slate-50 disabled:text-slate-500" />
        </label>
      </div>

      {mode === "text" ? (
        <label className="mt-4 block text-xs font-semibold text-slate-600">Test message
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-300" />
        </label>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Approved template
              <select value={templateName} onChange={(e) => chooseTemplate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-300">
                <option value="">Select an approved template…</option>
                {approvedTemplates.map((item) => (
                  <option key={item.key} value={item.metaTemplateName}>{item.metaTemplateName} — {item.audience}</option>
                ))}
              </select>
            </label>

            {selectedTemplate ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-700">Approved</span>
                  <span className="rounded-full bg-white px-2 py-1 font-semibold text-slate-600">{selectedTemplate.category}</span>
                  <span className="rounded-full bg-white px-2 py-1 font-semibold capitalize text-slate-600">{selectedTemplate.audience}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedTemplate.body}</p>
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Body parameters — one value per line
              <textarea value={bodyParams} onChange={(e) => setBodyParams(e.target.value)} rows={6} placeholder="Select a template to load its sample values" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-blue-300" />
            </label>
            {selectedTemplate ? (
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                {selectedTemplate.variables.map((variable, index) => (
                  <p key={`${variable}-${index}`}><span className="font-mono font-semibold text-slate-700">{`{{${index + 1}}}`}</span> = {variable.replaceAll("_", " ")}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void handleSend()} disabled={sending || !canSend} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="h-4 w-4" />{sending ? "Sending…" : "Send test"}
        </button>
        {mode === "template" && approvedTemplates.length > 0 ? <p className="text-xs text-slate-500">{approvedTemplates.length} approved templates available for testing.</p> : null}
      </div>

      {result ? (
        <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>
            <p className="font-semibold">{result.ok ? `Sent via ${result.provider ?? result.queue?.provider ?? "configured provider"}` : result.error ?? "WhatsApp test failed."}</p>
            {result.queue ? <p className="mt-0.5 text-[11px] opacity-80">Queue {result.queue.id?.slice(0, 8) ?? "—"} · {result.queue.recipient_role ?? recipientRole} · {result.queue.delivery_status ?? result.queue.status ?? "unknown"}{result.queue.provider_message_id || result.queue.meta_message_id ? ` · message ${result.queue.provider_message_id ?? result.queue.meta_message_id}` : ""}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
