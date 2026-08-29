"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Award, CheckCircle2, ClipboardCheck, Loader2, RefreshCw, Star, Users } from "lucide-react";
import { OfficeZohoPageHeader, OfficeZohoSecondaryButton, OfficeZohoTableShell } from "@/components/admin/office/OfficeZohoChrome";
import { OfficeZohoSelect } from "@/components/admin/office/OfficeZohoSelect";
import { OfficeZohoStatusBadge, type OfficeZohoStatusTone } from "@/components/admin/office/OfficeZohoStatusBadge";
import { useAdminData } from "@/hooks/useAdminData";

type ComponentScore = { score: number | null; weight: number; evidenceCount: number; label: string };
type Scorecard = {
  cleanerId: string;
  cleanerName: string;
  status: string | null;
  overallScore: number | null;
  grade: "A" | "B" | "C" | "D" | "Needs evidence";
  evidenceCoverage: number;
  components: {
    quality: ComponentScore;
    customerFeedback: ComponentScore;
    reliability: ComponentScore;
    completion: ComponentScore;
    attendance: ComponentScore;
  };
  complaints: { qualityRelatedCases: number; openQualityCases: number; penalty: number };
  facts: {
    rosterAssignments: number;
    completedBookings: number;
    reviews: number;
    qaInspections: number;
    attendanceObservations: number;
    totalOffers: number;
    acceptedOffers: number;
  };
};

type ResponseBody = {
  scorecards: Scorecard[];
  from: string;
  to: string;
  meta: { days: number; scorecardCount: number };
};

function pct(v: number | null): string { return v == null ? "—" : `${Math.round(v)}%`; }
function gradeTone(grade: Scorecard["grade"]): OfficeZohoStatusTone {
  if (grade === "A") return "positive";
  if (grade === "B") return "info";
  if (grade === "C") return "warn";
  if (grade === "D") return "danger";
  return "neutral";
}

export default function CleanerPerformancePage() {
  const [days, setDays] = useState(90);
  const { data, loading, error, refetch } = useAdminData<ResponseBody>(`/api/admin/cleaner-performance?days=${days}`);
  const rows = data?.scorecards ?? [];
  const summary = useMemo(() => {
    const scored = rows.filter((r) => r.overallScore != null);
    const avg = scored.length ? Math.round(scored.reduce((s, r) => s + (r.overallScore ?? 0), 0) / scored.length) : null;
    return {
      average: avg,
      strong: rows.filter((r) => r.grade === "A" || r.grade === "B").length,
      needsEvidence: rows.filter((r) => r.grade === "Needs evidence" || r.evidenceCoverage < 50).length,
      openQualityCases: rows.reduce((sum, r) => sum + r.complaints.openQualityCases, 0),
    };
  }, [rows]);

  return (
    <main className="space-y-6">
      <OfficeZohoPageHeader
        title="Cleaner Performance Scorecards"
        subtitle="Workforce quality — one read-only score from canonical roster, QA, reviews, execution and Customer Care evidence. Earnings and payouts are not part of this score."
        actions={
          <>
            <OfficeZohoSelect
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Scorecard period"
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </OfficeZohoSelect>
            <OfficeZohoSecondaryButton onClick={() => void refetch()}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </OfficeZohoSecondaryButton>
          </>
        }
      />

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Fleet performance", value: summary.average == null ? "—" : `${summary.average}%`, icon: Award },
          { label: "A / B performers", value: summary.strong, icon: CheckCircle2 },
          { label: "Need more evidence", value: summary.needsEvidence, icon: ClipboardCheck },
          { label: "Open quality cases", value: summary.openQualityCases, icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span><p className="mt-4 text-2xl font-bold tabular-nums text-slate-950">{loading ? "—" : value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></article>)}
      </section>

      <OfficeZohoTableShell>
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">Cleaner scorecards</h2><p className="mt-1 text-xs text-slate-500">Missing evidence does not count as zero; available component weights are re-normalised. Quality-related cases apply a capped penalty.</p></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Loading scorecards…</div> : !rows.length ? <div className="py-16 text-center text-sm text-slate-500"><Users className="mx-auto mb-3 h-7 w-7" />No cleaners found.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Cleaner</th><th className="px-5 py-3">Overall</th><th className="px-5 py-3">QA</th><th className="px-5 py-3">Reviews</th><th className="px-5 py-3">Reliability</th><th className="px-5 py-3">Completion</th><th className="px-5 py-3">Attendance</th><th className="px-5 py-3">Evidence</th><th className="px-5 py-3">Quality cases</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((r) => <tr key={r.cleanerId} className="hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{r.cleanerName}</p><p className="text-xs text-slate-500">{r.facts.completedBookings} completed · {r.facts.rosterAssignments} roster assignments</p></td><td className="px-5 py-4"><div className="flex items-center gap-2"><span className="text-lg font-bold tabular-nums text-slate-950">{pct(r.overallScore)}</span><OfficeZohoStatusBadge tone={gradeTone(r.grade)}>{r.grade}</OfficeZohoStatusBadge></div></td><td className="px-5 py-4"><span className="font-semibold">{pct(r.components.quality.score)}</span><p className="text-xs text-slate-400">{r.components.quality.evidenceCount} inspections</p></td><td className="px-5 py-4"><span className="inline-flex items-center gap-1 font-semibold"><Star className="h-3.5 w-3.5" />{pct(r.components.customerFeedback.score)}</span><p className="text-xs text-slate-400">{r.facts.reviews} reviews</p></td><td className="px-5 py-4 font-semibold">{pct(r.components.reliability.score)}</td><td className="px-5 py-4 font-semibold">{pct(r.components.completion.score)}</td><td className="px-5 py-4"><span className="font-semibold">{pct(r.components.attendance.score)}</span><p className="text-xs text-slate-400">{r.facts.attendanceObservations} timed starts</p></td><td className="px-5 py-4"><span className="font-semibold">{r.evidenceCoverage}%</span></td><td className="px-5 py-4"><span className={r.complaints.openQualityCases ? "font-semibold text-red-700" : "text-slate-600"}>{r.complaints.qualityRelatedCases} total / {r.complaints.openQualityCases} open</span>{r.complaints.penalty ? <p className="text-xs text-red-500">−{r.complaints.penalty} pts</p> : null}</td></tr>)}</tbody></table></div>
        )}
      </OfficeZohoTableShell>
    </main>
  );
}
