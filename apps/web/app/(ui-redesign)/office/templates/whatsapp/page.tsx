"use client";

import Link from "next/link";
import { useMemo, useState, type ComponentType } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type ApprovalStatus = "unknown" | "pending" | "approved" | "rejected";
type Audience = "customer" | "cleaner";
type ReadinessIcon = ComponentType<{ className?: string }>;

type ReadinessItem = {
  key: string;
  audience: Audience;
  category: "UTILITY" | "MARKETING";
  language: "en";
  metaTemplateName: string;
  mappingSource: "env" | "default";
  approvalStatus: ApprovalStatus;
  sendReady: boolean;
};

type ReadinessResponse = {
  fetchedAt: string;
  totals: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    unknown: number;
    sendReady: number;
  };
  templates: ReadinessItem[];
};

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; className: string; icon: ReadinessIcon }> = {
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700", icon: Clock3 },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700", icon: XCircle },
  unknown: { label: "Not confirmed", className: "bg-slate-100 text-slate-600", icon: AlertCircle },
};

function SummaryCard({ label, value, helper, icon: Icon }: { label: string; value: number; helper: string; icon: ReadinessIcon }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{helper}</p>
    </div>
  );
}

export default function WhatsAppTemplateReadinessPage() {
  const { data, loading, error, refetch } = useAdminData<ReadinessResponse>("/api/admin/whatsapp-template-readiness");
  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState<"all" | Audience>("all");
  const [status, setStatus] = useState<"all" | ApprovalStatus>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.templates ?? []).filter((item) => {
      const matchesSearch = !q || item.key.toLowerCase().includes(q) || item.metaTemplateName.toLowerCase().includes(q);
      const matchesAudience = audience === "all" || item.audience === audience;
      const matchesStatus = status === "all" || item.approvalStatus === status;
      return matchesSearch && matchesAudience && matchesStatus;
    });
  }, [audience, data?.templates, search, status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/office/templates" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Message Templates
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">WhatsApp Template Readiness</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-slate-500">
            Meta approval and mapping status for proactive WhatsApp messages. Only approved templates are considered ready to send outside the 24-hour window.
          </p>
        </div>
        <button type="button" onClick={() => void refetch()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Fail-closed protection is enabled</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">Unknown, pending, and rejected templates remain not ready until their Meta approval state is explicitly recorded.</p>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Total" value={data.totals.total} helper="Canonical templates" icon={MessageSquare} />
          <SummaryCard label="Send ready" value={data.totals.sendReady} helper="Approved by Meta" icon={CheckCircle2} />
          <SummaryCard label="Pending" value={data.totals.pending} helper="Awaiting approval" icon={Clock3} />
          <SummaryCard label="Not confirmed" value={data.totals.unknown} helper="Approval not recorded" icon={AlertCircle} />
          <SummaryCard label="Rejected" value={data.totals.rejected} helper="Needs correction" icon={XCircle} />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Shalean key or Meta template name…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-300" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(["all", "customer", "cleaner"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setAudience(value)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold capitalize", audience === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{value}</button>
              ))}
            </div>
            <div className="flex flex-wrap rounded-xl bg-slate-100 p-1">
              {(["all", "approved", "pending", "unknown", "rejected"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setStatus(value)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
                  {value === "unknown" ? "Not confirmed" : value.charAt(0).toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">No WhatsApp templates match these filters.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const statusConfig = STATUS_CONFIG[item.approvalStatus];
              const StatusIcon = statusConfig.icon;
              return (
                <div key={item.key} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_auto_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="truncate font-mono text-sm font-semibold text-slate-800">{item.key}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{item.audience}</span></div>
                    <p className="mt-1 text-xs text-slate-400">{item.category} · {item.language}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Meta template</p>
                    <p className="mt-0.5 truncate font-mono text-sm text-slate-700">{item.metaTemplateName}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">Mapping: {item.mappingSource === "env" ? "Vercel override" : "default Shalean key"}</p>
                  </div>
                  <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", statusConfig.className)}><StatusIcon className="h-3.5 w-3.5" /> {statusConfig.label}</span>
                  <span className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold", item.sendReady ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{item.sendReady ? "Ready to send" : "Not ready"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data?.fetchedAt ? <p className="text-xs text-slate-400">Status refreshed {new Date(data.fetchedAt).toLocaleString()}.</p> : null}
    </div>
  );
}
