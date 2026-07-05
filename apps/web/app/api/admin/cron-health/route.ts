import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CronHealthJobSummary = {
  job_name: string;
  last_success_at: string | null;
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
  last_run_message: string | null;
  errors_last_24h: number;
};

export type CronHealthRecentError = {
  job_name: string;
  created_at: string;
  message: string;
};

/** Jobs that must show last success even when older than the 24h dashboard window. */
const CRITICAL_JOB_FALLBACK = [
  "generate-recurring-bookings",
  "charge-recurring-bookings",
  "charge-monthly-invoices",
  "payout-integrity-daily",
] as const;

/** Rows logged before we stopped persisting 401s, or stray unauthenticated HTTP hits — not failed job execution. */
function isCronAuthProbeRow(message: string | null | undefined): boolean {
  const m = (message ?? "").trim();
  return m === "Unauthorized." || m === "[auth] Unauthorized." || m.startsWith("[auth] Unauthorized");
}

/**
 * Recent outcomes from `cron_runs` (generator + charger + future jobs).
 */
export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: rows, error } = await admin
    .from("cron_runs")
    .select("job_name, status, created_at, message")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byJob = new Map<
    string,
    {
      last_success_at: string | null;
      last_run_at: string | null;
      last_run_status: "success" | "error" | null;
      last_run_message: string | null;
      errors_last_24h: number;
    }
  >();

  const recentErrors: CronHealthRecentError[] = [];

  for (const raw of rows ?? []) {
    const r = raw as { job_name?: string; status?: string; created_at?: string; message?: string | null };
    const job = typeof r.job_name === "string" ? r.job_name.trim() : "";
    const created = typeof r.created_at === "string" ? r.created_at : "";
    const status = typeof r.status === "string" ? r.status.trim().toLowerCase() : "";
    if (!job || !created) continue;

    let agg = byJob.get(job);
    if (!agg) {
      agg = {
        last_success_at: null,
        last_run_at: null,
        last_run_status: null,
        last_run_message: null,
        errors_last_24h: 0,
      };
      byJob.set(job, agg);
    }
    if (!agg.last_run_at) {
      agg.last_run_at = created;
      agg.last_run_status = status === "success" || status === "error" ? status : null;
      const msg = typeof r.message === "string" ? r.message.trim() : "";
      agg.last_run_message = msg || null;
    }
    if (status === "success" && !agg.last_success_at) {
      agg.last_success_at = created;
    }
    if (status === "error") {
      const msg = typeof r.message === "string" ? r.message.trim() : "";
      if (!isCronAuthProbeRow(msg)) {
        agg.errors_last_24h += 1;
        if (recentErrors.length < 50) {
          recentErrors.push({ job_name: job, created_at: created, message: msg || "(no message)" });
        }
      }
    }
  }

  for (const jobName of CRITICAL_JOB_FALLBACK) {
    const agg = byJob.get(jobName);
    if (agg?.last_success_at) continue;
    const { data: lastOk } = await admin
      .from("cron_runs")
      .select("created_at")
      .eq("job_name", jobName)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1);
    const created = (lastOk?.[0] as { created_at?: string } | undefined)?.created_at;
    if (!created) continue;
    if (!agg) {
      byJob.set(jobName, {
        last_success_at: created,
        last_run_at: created,
        last_run_status: "success",
        last_run_message: null,
        errors_last_24h: 0,
      });
    } else {
      agg.last_success_at = created;
      if (!agg.last_run_at) agg.last_run_at = created;
    }
  }

  const jobs: CronHealthJobSummary[] = [...byJob.entries()]
    .map(([job_name, v]) => ({
      job_name,
      last_success_at: v.last_success_at,
      last_run_at: v.last_run_at,
      last_run_status: v.last_run_status,
      last_run_message: v.last_run_message,
      errors_last_24h: v.errors_last_24h,
    }))
    .sort((a, b) => a.job_name.localeCompare(b.job_name));

  return NextResponse.json({ ok: true, since, jobs, recent_errors: recentErrors });
}
