"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type Review = {
  id: string;
  reviewerUserId: string;
  reviewerEmail: string;
  outcome: "keep" | "change_required" | "revoke_required";
  notes: string | null;
  reviewedAt: string;
  nextReviewAt: string;
};

type Assignment = {
  assignmentId: string;
  userId: string;
  userEmail: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  roleActive: boolean;
  branchId: string | null;
  teamId: string | null;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string | null;
  status: "active" | "scheduled" | "expired" | "revoked";
  reviewDue: boolean;
  expiresSoon: boolean;
  latestReview: Review | null;
};

type Payload = {
  ok?: boolean;
  counts?: { total: number; active: number; scheduled: number; expired: number; revoked: number; reviewDue: number; expiresSoon: number };
  assignments?: Assignment[];
  error?: string;
};

function dateLabel(value: string | null): string {
  if (!value) return "No expiry";
  try {
    return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusClass(item: Assignment): string {
  if (item.status === "revoked" || item.status === "expired") return "bg-slate-100 text-slate-600";
  if (item.reviewDue || item.expiresSoon) return "bg-amber-50 text-amber-800";
  if (item.status === "scheduled") return "bg-blue-50 text-blue-700";
  return "bg-emerald-50 text-emerald-700";
}

export function OfficeSecurityAccessReview() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [counts, setCounts] = useState<Payload["counts"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"due" | "active" | "all">("due");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Your Office session is unavailable. Please sign in again.");
      const response = await fetch("/api/admin/security/access-review", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok) throw new Error(payload?.error || "Unable to load access review.");
      setAssignments(payload?.assignments ?? []);
      setCounts(payload?.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load access review.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => assignments.filter((item) => {
    if (filter === "due") return item.reviewDue || item.expiresSoon || item.status === "expired";
    if (filter === "active") return item.status === "active";
    return true;
  }), [assignments, filter]);

  const recordReview = useCallback(async (assignmentId: string, outcome: Review["outcome"]) => {
    const notes = window.prompt(
      outcome === "keep" ? "Optional review note:" : "Add a short reason for the required change:",
      "",
    );
    if (notes === null) return;
    setSaving(assignmentId);
    setError(null);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Your Office session is unavailable. Please sign in again.");
      const response = await fetch("/api/admin/security/access-review", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, outcome, notes }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Unable to record access review.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record access review.");
    } finally {
      setSaving(null);
    }
  }, [load]);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Monthly governance</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Admin access review</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Review active role assignments, temporary access and expiries. Recording a review does not silently widen, revoke or change permissions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["due", "active", "all"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-sm font-medium ${filter === value ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{value === "due" ? "Needs review" : value === "active" ? "Active" : "All"}</button>
          ))}
          <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Refresh</button>
        </div>
      </div>

      {counts ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Active assignments</p><p className="mt-1 text-2xl font-semibold text-slate-950">{counts.active}</p></div>
        <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Review due</p><p className="mt-1 text-2xl font-semibold text-amber-950">{counts.reviewDue}</p></div>
        <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Expiring in 7 days</p><p className="mt-1 text-2xl font-semibold text-amber-950">{counts.expiresSoon}</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Expired / revoked</p><p className="mt-1 text-2xl font-semibold text-slate-950">{counts.expired + counts.revoked}</p></div>
      </div> : null}

      {loading ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Loading access assignments…</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
      {!loading && !error && visible.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">No assignments need attention in this view.</div> : null}

      <div className="space-y-3">
        {visible.map((item) => (
          <article key={item.assignmentId} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-950">{item.userEmail}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass(item)}`}>{item.status}</span>
                  {item.reviewDue ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-900">Review due</span> : null}
                  {item.expiresSoon ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-900">Expiring soon</span> : null}
                </div>
                <p className="mt-2 text-sm text-slate-700">{item.roleName} <span className="text-slate-400">({item.roleCode})</span></p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                  <span>Starts: {dateLabel(item.startsAt)}</span>
                  <span>Expires: {dateLabel(item.expiresAt)}</span>
                  <span>Branch: {item.branchId ?? "Global"}</span>
                  <span>Team: {item.teamId ?? "None"}</span>
                </div>
                {item.reason ? <p className="mt-2 text-xs text-slate-500">Grant reason: {item.reason}</p> : null}
                {item.latestReview ? <p className="mt-3 text-xs text-slate-500">Last reviewed {dateLabel(item.latestReview.reviewedAt)} by {item.latestReview.reviewerEmail} · outcome: {item.latestReview.outcome.replace(/_/g, " ")} · next review {dateLabel(item.latestReview.nextReviewAt)}</p> : <p className="mt-3 text-xs font-medium text-amber-700">No access review recorded yet.</p>}
              </div>
              {item.status === "active" ? <div className="flex shrink-0 flex-wrap gap-2">
                <button disabled={saving === item.assignmentId} type="button" onClick={() => void recordReview(item.assignmentId, "keep")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Keep access</button>
                <button disabled={saving === item.assignmentId} type="button" onClick={() => void recordReview(item.assignmentId, "change_required")} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50">Change required</button>
                <button disabled={saving === item.assignmentId} type="button" onClick={() => void recordReview(item.assignmentId, "revoke_required")} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50">Revoke required</button>
              </div> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
