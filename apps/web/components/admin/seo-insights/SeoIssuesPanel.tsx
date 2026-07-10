"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadCsv } from "@/lib/admin/csvExport";
import {
  buildOfficeSeoIssueBreakdown,
  buildOfficeSeoIssuesCsv,
  buildOfficeSeoRecommendationRows,
  type SeoRecommendationSeverityFilter,
} from "@/lib/admin/officeSeoInsightsPresentation";
import type { SeoInsightsPayload } from "@/lib/admin/officeSeoInsightsPresentation";
import { locationHubPathFromAreaInput } from "@/lib/seo/capeTownLocations";
import { cn } from "@/lib/utils";

const FILTERS: { id: SeoRecommendationSeverityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warnings" },
  { id: "opportunity", label: "Opportunities" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SeoInsightsPayload | null;
  initialFilter?: SeoRecommendationSeverityFilter;
};

function severityTone(severity: "critical" | "warning" | "opportunity") {
  if (severity === "critical") {
    return {
      card: "border-red-200 bg-red-50",
      badge: "bg-red-100 text-red-800",
      icon: "text-red-600",
    };
  }
  if (severity === "warning") {
    return {
      card: "border-amber-200 bg-amber-50",
      badge: "bg-amber-100 text-amber-900",
      icon: "text-amber-600",
    };
  }
  return {
    card: "border-blue-200 bg-blue-50",
    badge: "bg-blue-100 text-blue-900",
    icon: "text-blue-600",
  };
}

export function SeoIssuesPanel({ open, onOpenChange, data, initialFilter = "all" }: Props) {
  const [filter, setFilter] = useState<SeoRecommendationSeverityFilter>(initialFilter);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setFilter(initialFilter);
      setSearch("");
    }
  }, [open, initialFilter]);

  const breakdown = useMemo(() => buildOfficeSeoIssueBreakdown(data), [data]);
  const allRows = useMemo(() => buildOfficeSeoRecommendationRows(data, filter), [data, filter]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        (row.slug?.toLowerCase().includes(q) ?? false) ||
        (row.pageLabel?.toLowerCase().includes(q) ?? false) ||
        (row.detailText?.toLowerCase().includes(q) ?? false),
    );
  }, [allRows, search]);

  function handleExport() {
    if (filteredRows.length === 0) return;
    downloadCsv(`seo-issues-${new Date().toISOString().slice(0, 10)}.csv`, buildOfficeSeoIssuesCsv(filteredRows));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <div className="flex max-h-[min(88vh,820px)] flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 text-left">
          <DialogTitle>All SEO issues</DialogTitle>
          <DialogDescription>
            {breakdown.critical} critical · {breakdown.warnings} warnings · {breakdown.opportunities} opportunities
            {" · "}
            deduplicated by page and issue type
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                filter === item.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {item.label}
              {item.id === "critical" ? ` (${breakdown.critical})` : null}
              {item.id === "warning" ? ` (${breakdown.warnings})` : null}
              {item.id === "opportunity" ? ` (${breakdown.opportunities})` : null}
              {item.id === "all"
                ? ` (${breakdown.critical + breakdown.warnings + breakdown.opportunities})`
                : null}
            </button>
          ))}
          <button
            type="button"
            onClick={handleExport}
            disabled={filteredRows.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues, pages, or slugs…"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No issues match your filters.</p>
          ) : (
            <div className="space-y-3">
              {filteredRows.map((issue) => {
                const tone = severityTone(issue.severityFilter);
                return (
                  <div key={issue.id} className={cn("rounded-xl border p-4", tone.card)}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        {issue.severityFilter === "opportunity" ? (
                          <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", tone.icon)} />
                        ) : (
                          <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", tone.icon)} />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{issue.title}</p>
                          {issue.pageLabel ? (
                            <p className="mt-0.5 text-xs text-slate-600">
                              {issue.slug ? (
                                <Link
                                  href={locationHubPathFromAreaInput(issue.slug)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 hover:underline"
                                >
                                  {issue.pageLabel}
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                                </Link>
                              ) : (
                                issue.pageLabel
                              )}
                              {issue.slug ? (
                                <span className="ml-2 font-mono text-[10px] text-slate-400">{issue.slug}</span>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", tone.badge)}>
                        {issue.severityFilter}
                      </span>
                    </div>
                    {issue.detailText ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{issue.detailText}</p> : null}
                    {issue.kind ? (
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-slate-400">{issue.kind}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
