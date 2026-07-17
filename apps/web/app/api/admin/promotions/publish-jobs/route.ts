import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { listPublishJobsForIntelligence } from "@/lib/promotions/publishIntelligence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set([
  "queued",
  "leased",
  "retryable",
  "succeeded",
  "dead_letter",
  "cancelled",
]);

/**
 * MKT-001E — List social publish jobs for intelligence drill-down (admin-only).
 * GET /api/admin/promotions/publish-jobs?status=&provider=&limit=
 *
 * Does not expose sanitized payload message/link bodies in the list response
 * to keep the ops table lean and reduce accidental PII surface.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status");
  const provider = url.searchParams.get("provider");
  const campaign = url.searchParams.get("campaign");
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

  if (statusRaw && !ALLOWED_STATUS.has(statusRaw)) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }

  try {
    const jobs = await listPublishJobsForIntelligence(admin, {
      status: statusRaw,
      provider,
      campaign,
      limit,
    });
    return NextResponse.json({
      ok: true,
      jobs: jobs.map((j) => ({
        id: j.id,
        provider: j.provider,
        campaignName: j.campaign_name,
        status: j.status,
        failureClass: j.failure_class,
        lastError: j.last_error,
        correlationId: j.correlation_id,
        attempts: j.attempts,
        maxAttempts: j.max_attempts,
        scheduledFor: j.scheduled_for,
        nextAttemptAt: j.next_attempt_at,
        deadLetteredAt: j.dead_lettered_at,
        processedAt: j.processed_at,
        createdAt: j.created_at,
        updatedAt: j.updated_at,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
