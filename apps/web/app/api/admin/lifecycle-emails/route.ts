import { NextResponse } from "next/server";
import {
  applyLifecycleEmailJobFilters,
  computeLifecycleEmailSummary,
  enrichLifecycleEmailJobs,
  filterJobsByCustomerType,
  JOB_SELECT,
  parseLifecycleEmailsLimit,
  parseLifecycleEmailsOffset,
  type LifecycleEmailJobFilters,
  type LifecycleEmailJobRow,
} from "@/lib/admin/lifecycleEmailsAdmin";
import {
  evaluateLifecycleEmailAlerts,
  fetchOpenLifecycleAlerts,
} from "@/lib/admin/lifecycleEmailMonitoring";
import { getEffectiveLifecycleEmailSettings } from "@/lib/booking/lifecycleEmailSettings";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filtersFromUrl(url: URL): LifecycleEmailJobFilters {
  return {
    status: url.searchParams.get("status"),
    job_type: url.searchParams.get("job_type"),
    search: url.searchParams.get("search"),
    date_from: url.searchParams.get("date_from"),
    date_to: url.searchParams.get("date_to"),
    customer_type: url.searchParams.get("customer_type"),
    queue: url.searchParams.get("queue"),
    skipped_reason: url.searchParams.get("skipped_reason"),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const filters = filtersFromUrl(url);
  const limit = parseLifecycleEmailsLimit(url.searchParams.get("limit"));
  const offset = parseLifecycleEmailsOffset(url.searchParams.get("offset"));

  const base = () => admin.from("booking_lifecycle_jobs");

  const [jobsRes, totalRes, summary, settings, monitoring, alerts] = await Promise.all([
    applyLifecycleEmailJobFilters(
      base().select(JOB_SELECT).order("scheduled_for", { ascending: false }),
      filters,
    ).range(offset, offset + limit - 1),
    applyLifecycleEmailJobFilters(base().select("id", { count: "exact", head: true }), filters),
    computeLifecycleEmailSummary(admin),
    getEffectiveLifecycleEmailSettings(admin),
    evaluateLifecycleEmailAlerts(admin),
    fetchOpenLifecycleAlerts(admin),
  ]);

  if (jobsRes.error) return NextResponse.json({ error: jobsRes.error.message }, { status: 500 });
  if (totalRes.error) return NextResponse.json({ error: totalRes.error.message }, { status: 500 });

  const total = totalRes.count ?? 0;
  let jobs = (jobsRes.data ?? []) as LifecycleEmailJobRow[];
  jobs = await enrichLifecycleEmailJobs(admin, jobs);
  jobs = await filterJobsByCustomerType(jobs, filters.customer_type);

  return NextResponse.json({
    jobs,
    limit,
    offset,
    hasMore: offset + limit < total,
    total,
    summary,
    settings: {
      emails_enabled: settings.emailsEnabled,
      dry_run_enabled: settings.dryRunEnabled,
      frequency_limit_enabled: settings.frequencyLimitEnabled,
      paused_by_env: settings.pausedByEnv,
      dry_run_by_env: settings.dryRunByEnv,
    },
    cron: {
      last_success_at: monitoring.lastCronSuccessAt,
      pending_count: monitoring.pendingCount,
      oldest_pending_scheduled_for: monitoring.oldestPendingScheduledFor,
    },
    alerts,
  });
}
