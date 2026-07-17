import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { replayDeadLetterJob } from "@/lib/promotions/publishJobs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * MKT-001B.2 — Explicit admin DLQ replay (authorized + idempotent).
 * POST /api/admin/promotions/publish-jobs/[id]/replay
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Job id required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const result = await replayDeadLetterJob({
    admin,
    jobId: id.trim(),
    actor: auth.email,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  return NextResponse.json({
    ok: true,
    idempotent: result.idempotent,
    reason: result.reason,
    job: {
      id: result.job.id,
      status: result.job.status,
      provider: result.job.provider,
      correlationId: result.job.correlation_id,
      attempts: result.job.attempts,
      externalPostId: result.job.external_post_id,
      replayedFromJobId: result.job.replayed_from_job_id,
    },
  });
}
