"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import type { OfficeTemplateChannel, OfficeTemplateItem, OfficeTemplatesSummary } from "@/lib/admin/officeTemplates";
import { buildDefaultTemplatePreviewData } from "@/lib/admin/templatePreviewDefaults";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { cn } from "@/lib/utils";

const CHANNEL_FILTER_LABELS: Record<"all" | OfficeTemplateChannel, string> = {
  all: "All",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const CHANNEL_CONFIG: Record<
  OfficeTemplateChannel,
  { icon: typeof Mail; color: string }
> = {
  email: { icon: Mail, color: "bg-blue-50 text-blue-600" },
  sms: { icon: Bell, color: "bg-violet-50 text-violet-600" },
  whatsapp: { icon: MessageSquare, color: "bg-emerald-50 text-emerald-600" },
};

function TemplateDetailPanel({
  template,
  onClose,
  onSaved,
}: {
  template: OfficeTemplateItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  async function sendTestToMe() {
    setSendingTest(true);
    const res = await adminFetch<{ success?: boolean; sent_to?: string }>("/api/admin/templates/test-send", {
      method: "POST",
      body: JSON.stringify({
        key: template.key,
        to: "self",
        data: buildDefaultTemplatePreviewData(),
      }),
    });
    setSendingTest(false);
    if (!res.ok) {
      emitAdminToast(res.error ?? "Test send failed.", "error");
      return;
    }
    emitAdminToast(`Test email sent to ${res.data?.sent_to ?? "your inbox"}.`, "success");
  }

  async function toggleActive() {
    setToggling(true);
    const next = template.status !== "active";
    const res = await adminFetch("/api/admin/templates", {
      method: "PATCH",
      body: JSON.stringify({ id: template.id, is_active: next }),
    });
    setToggling(false);
    if (res.ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-lg font-bold text-slate-900">{template.name}</p>
            <p className="text-sm text-slate-500">
              {template.channelLabel} · <span className="font-mono text-xs">{template.key}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-8rem)] space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trigger</p>
              <p className="mt-0.5 text-sm text-slate-800">{template.trigger}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last updated</p>
              <p className="mt-0.5 text-sm text-slate-800">{template.updatedLabel}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">30d sent</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{template.usage.sent}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">30d failed</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{template.usage.failed}</p>
            </div>
          </div>

          {template.subject ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</p>
              <p className="mt-1 text-sm text-slate-800">{template.subject}</p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Content</p>
            <pre className="mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
              {template.content}
            </pre>
          </div>

          {template.variables.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variables</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {template.variables.map((v) => (
                  <span key={v} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {template.channel === "email" ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Test this template</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Sends a preview with sample data to your admin email. Does not affect production jobs.
              </p>
              <button
                type="button"
                disabled={sendingTest || template.status !== "active"}
                onClick={() => void sendTestToMe()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {sendingTest ? "Sending…" : "Send test to me"}
              </button>
              {template.status !== "active" ? (
                <p className="mt-2 text-xs text-amber-700">Activate this template before sending a test.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/office/notification-logs?search=${encodeURIComponent(template.key)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              View logs <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href={`/office/templates/editor?templateId=${encodeURIComponent(template.id)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Full editor <Edit2 className="h-3.5 w-3.5" />
            </Link>
          </div>
          <button
            type="button"
            disabled={toggling}
            onClick={() => void toggleActive()}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50",
              template.status === "active"
                ? "border border-slate-200 text-slate-700 hover:bg-slate-50"
                : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            {toggling ? "Saving…" : template.status === "active" ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { data, loading, error, refetch } = useAdminData<OfficeTemplatesSummary>("/api/admin/office-templates");
  const [channel, setChannel] = useState<OfficeTemplateChannel | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OfficeTemplateItem | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.templates ?? []).filter((t) => {
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        t.trigger.toLowerCase().includes(q);
      const matchesChannel = channel === "all" || t.channel === channel;
      return matchesSearch && matchesChannel;
    });
  }, [channel, data?.templates, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Message Templates</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Live templates from Supabase with 30-day delivery stats from notification logs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
          <Link
            href="/office/templates/editor"
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
          >
            <FileText className="h-4 w-4" />
            Full editor
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {data.channels.map((ch) => {
              const cfg = CHANNEL_CONFIG[ch.channel];
              const Icon = cfg.icon;
              return (
                <div key={ch.channel} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-xl", cfg.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ch.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800">{ch.count}</p>
                  <p className="text-xs text-slate-400">
                    {ch.activeCount} active · {data.templates.filter((t) => t.channel === ch.channel).reduce((s, t) => s + t.usage.sent, 0)} sent (30d)
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            {data.totals.total} templates · {data.totals.active} active · {data.totals.sent30d} delivered · {data.totals.failed30d} failed (30d)
          </p>
        </>
      ) : loading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "email", "sms", "whatsapp"] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  channel === ch ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {CHANNEL_FILTER_LABELS[ch]}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            {data?.templates.length === 0
              ? "No templates in the database. Run the latest Supabase migrations."
              : "No templates match your filters."}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map((t) => {
              const cfg = CHANNEL_CONFIG[t.channel];
              const Icon = cfg.icon;
              return (
                <div
                  key={t.id}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/50"
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", cfg.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {t.trigger} · {t.channelLabel} · Updated {t.updatedLabel}
                      {t.usage.lastSentLabel ? ` · Last sent ${t.usage.lastSentLabel}` : ""}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{t.contentPreview}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-slate-500 sm:inline">
                      {t.usage.sent} sent{t.usage.failed > 0 ? ` · ${t.usage.failed} failed` : ""}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-bold",
                        t.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {t.statusLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      aria-label={`View ${t.name}`}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <Link
                      href={`/office/templates/editor?templateId=${encodeURIComponent(t.id)}`}
                      className="rounded-lg p-1.5 text-slate-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-600"
                      aria-label={`Edit ${t.name}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected ? (
        <TemplateDetailPanel
          template={selected}
          onClose={() => setSelected(null)}
          onSaved={() => void refetch()}
        />
      ) : null}
    </div>
  );
}
