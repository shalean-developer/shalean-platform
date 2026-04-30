import { NextResponse } from "next/server";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import {
  CLEANER_JOB_ISSUE_REASON_VERSION,
  buildCleanerJobIssueWhatsappSnapshot,
  isValidCleanerJobIssueReasonKey,
  labelForCleanerJobIssueReasonKey,
} from "@/lib/cleaner/cleanerJobIssueReasons";
import {
  findActiveIdempotencyReport,
  hashCleanerIssueIdempotencyKey,
  registerCleanerIssueIdempotency,
} from "@/lib/cleaner/cleanerIssueReportIdempotency";
import { checkCleanerIssueReportRateLimitDb } from "@/lib/cleaner/cleanerIssueReportRateLimit";
import { notifyOpsOfCleanerIssueReport } from "@/lib/cleaner/notifyOpsCleanerIssueReport";
import { resolveCleanerFromRequest } from "@/lib/cleaner/session";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEDUPE_WINDOW_MS = 2 * 60_000;

async function findRecentDuplicateSameReason(
  admin: SupabaseClient,
  bookingId: string,
  cleanerId: string,
  reasonKey: string,
): Promise<string | null> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("cleaner_job_issue_reports")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", cleanerId)
    .eq("reason_key", reasonKey)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || typeof (data as { id?: string }).id !== "string") return null;
  return (data as { id: string }).id;
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const idemHeaderRaw = request.headers.get("idempotency-key") ?? request.headers.get("Idempotency-Key");
  const idempotencyKey =
    typeof idemHeaderRaw === "string" && idemHeaderRaw.trim().length > 0 ? idemHeaderRaw.trim().slice(0, 128) : "";

  let body: { reason_key?: unknown; detail?: unknown; location_hint?: unknown };
  try {
    body = (await request.json()) as { reason_key?: unknown; detail?: unknown; location_hint?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const reasonRaw = typeof body.reason_key === "string" ? body.reason_key.trim() : "";
  if (!isValidCleanerJobIssueReasonKey(reasonRaw)) {
    return NextResponse.json({ error: "Invalid or missing reason." }, { status: 400 });
  }

  let detail: string | null = null;
  if (typeof body.detail === "string") {
    const t = body.detail.trim();
    if (t.length > 0) detail = t.slice(0, 2000);
  }

  let locationHint: string | null = null;
  if (typeof body.location_hint === "string") {
    const s = body.location_hint.trim();
    if (s.length > 0) locationHint = s.slice(0, 500);
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  const cleanerId = session.cleaner.id;

  const { data: row, error } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const record = row as Record<string, unknown>;
  const canAccess = await cleanerHasBookingAccess(admin, cleanerId, {
    id: bookingId,
    cleaner_id: (record.cleaner_id as string | null | undefined) ?? null,
    payout_owner_cleaner_id: (record.payout_owner_cleaner_id as string | null | undefined) ?? null,
    team_id: (record.team_id as string | null | undefined) ?? null,
    is_team_job: record.is_team_job === true,
  });
  if (!canAccess) {
    return NextResponse.json({ error: "You do not have access to report on this booking." }, { status: 403 });
  }

  const reasonLabel = labelForCleanerJobIssueReasonKey(reasonRaw);
  const waSnap = buildCleanerJobIssueWhatsappSnapshot({
    bookingId,
    reasonLabel,
    detail,
    location: locationHint,
  });

  const replayHeaders = { "X-Idempotent-Replayed": "1" };

  if (idempotencyKey) {
    const keyHash = hashCleanerIssueIdempotencyKey(cleanerId, bookingId, idempotencyKey);
    const existingIdem = await findActiveIdempotencyReport(admin, cleanerId, bookingId, keyHash);
    if (existingIdem) {
      metrics.increment("cleaner_issue_report_duplicate_ignored", { kind: "idempotency_key" });
      return NextResponse.json(
        { ok: true as const, reportId: existingIdem, replayed: true as const },
        { headers: replayHeaders },
      );
    }
  }

  const dupId = await findRecentDuplicateSameReason(admin, bookingId, cleanerId, reasonRaw);
  if (dupId) {
    metrics.increment("cleaner_issue_report_duplicate_ignored", { kind: "same_reason_2m" });
    if (idempotencyKey) {
      const keyHash = hashCleanerIssueIdempotencyKey(cleanerId, bookingId, idempotencyKey);
      await registerCleanerIssueIdempotency(admin, {
        cleanerId,
        bookingId,
        keyHash,
        reportId: dupId,
      });
    }
    return NextResponse.json(
      { ok: true as const, reportId: dupId, duplicateIgnored: true as const },
      { headers: replayHeaders },
    );
  }

  const rate = await checkCleanerIssueReportRateLimitDb(admin, cleanerId, bookingId);
  if (!rate.ok) {
    metrics.increment("cleaner_issue_report_rate_limited");
    return NextResponse.json(
      { error: "Too many reports for this booking. Please wait before submitting again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  const { data: inserted, error: insErr } = await admin
    .from("cleaner_job_issue_reports")
    .insert({
      booking_id: bookingId,
      cleaner_id: cleanerId,
      reason_key: reasonRaw,
      detail,
      reason_version: CLEANER_JOB_ISSUE_REASON_VERSION,
      whatsapp_snapshot: waSnap,
      idempotency_key: idempotencyKey || null,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const reportId =
    inserted && typeof (inserted as { id?: string }).id === "string" ? (inserted as { id: string }).id : null;
  if (!reportId) {
    return NextResponse.json({ error: "Could not create report." }, { status: 500 });
  }

  metrics.increment("cleaner_issue_report_created");

  if (idempotencyKey) {
    const keyHash = hashCleanerIssueIdempotencyKey(cleanerId, bookingId, idempotencyKey);
    await registerCleanerIssueIdempotency(admin, { cleanerId, bookingId, keyHash, reportId });
  }

  void logSystemEvent({
    level: "info",
    source: "cleaner_job_issue_report",
    message: `Cleaner reported issue: ${reasonLabel}`,
    context: {
      bookingId,
      cleanerId,
      reason_key: reasonRaw,
      reportId,
      reason_version: CLEANER_JOB_ISSUE_REASON_VERSION,
    },
  });

  void notifyOpsOfCleanerIssueReport({
    admin,
    bookingId,
    cleanerId,
    reportId,
    reasonLabel,
    reasonKey: reasonRaw,
  });

  return NextResponse.json({ ok: true as const, reportId });
}
