"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CleanerRow = {
  cleanerId: string;
  cleanerName: string;
  status: string | null;
  trainingAssigned: number;
  trainingCompleted: number;
  overdueTraining: number;
  complianceRecords: number;
  missingComplianceEvidence: boolean;
  nonCompliant: number;
  ready: boolean;
};

type ModuleRow = {
  id: string;
  code: string;
  title: string;
  category: string | null;
  is_required: boolean;
  validity_days: number | null;
};

type ResponseBody = { cleaners?: CleanerRow[]; modules?: ModuleRow[]; error?: string };

export default function WorkforceTrainingPage() {
  const [data, setData] = useState<ResponseBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/workforce/training-compliance", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as ResponseBody;
      if (!res.ok) throw new Error(body.error ?? "Could not load training/compliance.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load training/compliance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cleaners = data?.cleaners ?? [];
  const ready = cleaners.filter((row) => row.ready).length;
  const needsAction = cleaners.length - ready;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Workforce training & compliance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Canonical readiness from required training assignments and compliance records.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border px-3 py-2 text-sm" href="/office/cleaners">Cleaner management</Link>
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => void load()} type="button">Refresh</button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Cleaners" value={loading ? "…" : String(cleaners.length)} />
        <Metric label="Ready" value={loading ? "…" : String(ready)} />
        <Metric label="Needs action" value={loading ? "…" : String(needsAction)} />
      </div>

      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Cleaner readiness</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Cleaner</th>
                <th className="px-4 py-3">Readiness</th>
                <th className="px-4 py-3">Training</th>
                <th className="px-4 py-3">Missing / overdue</th>
                <th className="px-4 py-3">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {cleaners.map((row) => (
                <tr className="border-t" key={row.cleanerId}>
                  <td className="px-4 py-3 font-medium">{row.cleanerName}</td>
                  <td className="px-4 py-3">{row.ready ? "Ready" : "Action needed"}</td>
                  <td className="px-4 py-3">{row.trainingCompleted}/{row.trainingAssigned}</td>
                  <td className="px-4 py-3">{row.overdueTraining}</td>
                  <td className="px-4 py-3">
                    {row.missingComplianceEvidence
                      ? "No evidence"
                      : row.nonCompliant > 0
                        ? `${row.nonCompliant} issue${row.nonCompliant === 1 ? "" : "s"}`
                        : "Current"}
                  </td>
                </tr>
              ))}
              {!loading && cleaners.length === 0 ? (
                <tr><td className="px-4 py-6 text-muted-foreground" colSpan={5}>No cleaners found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Active training modules</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {(data?.modules ?? []).map((module) => (
            <div className="rounded-lg border p-3" key={module.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{module.title}</span>
                <span className="text-xs text-muted-foreground">{module.is_required ? "Required" : "Optional"}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {module.category ?? "general"}{module.validity_days ? ` · renew every ${module.validity_days} days` : ""}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
