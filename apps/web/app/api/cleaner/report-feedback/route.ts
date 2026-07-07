import { NextResponse } from "next/server";
import { validateCleanerReportFeedbackBody } from "@/lib/cleaner/cleanerReportFeedback";
import { notifyOpsOfAnonymousCleanerReport } from "@/lib/cleaner/notifyOpsAnonymousCleanerReport";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_RATE_LIMIT = 3;
const REPORT_RATE_WINDOW_MS = 60 * 60 * 1000;
const FEEDBACK_RATE_LIMIT = 5;
const FEEDBACK_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

async function countRecentSubmissions(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  cleanerId: string,
  submissionType: "report" | "feedback",
  sinceIso: string,
): Promise<number> {
  const { count, error } = await admin
    .from("cleaner_report_feedback")
    .select("id", { count: "exact", head: true })
    .eq("cleaner_id", cleanerId)
    .eq("submission_type", submissionType)
    .gte("created_at", sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const auth = await resolveCleanerFromRequest(request, admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await admin
    .from("cleaner_report_feedback")
    .select("id, submission_type, subject, message, status, admin_response, created_at, resolved_at")
    .eq("cleaner_id", auth.cleaner.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submissions: data ?? [] });
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const auth = await resolveCleanerFromRequest(request, admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = validateCleanerReportFeedbackBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const cleanerId = auth.cleaner.id;
  const now = Date.now();
  const sinceIso =
    parsed.submissionType === "report"
      ? new Date(now - REPORT_RATE_WINDOW_MS).toISOString()
      : new Date(now - FEEDBACK_RATE_WINDOW_MS).toISOString();
  const limit = parsed.submissionType === "report" ? REPORT_RATE_LIMIT : FEEDBACK_RATE_LIMIT;

  try {
    const recentCount = await countRecentSubmissions(admin, cleanerId, parsed.submissionType, sinceIso);
    if (recentCount >= limit) {
      const windowLabel = parsed.submissionType === "report" ? "hour" : "day";
      return NextResponse.json(
        { error: `You have reached the limit of ${limit} ${parsed.submissionType}s per ${windowLabel}. Please try again later.` },
        { status: 429 },
      );
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Rate limit check failed." }, { status: 500 });
  }

  const { data: inserted, error: insErr } = await admin
    .from("cleaner_report_feedback")
    .insert({
      submission_type: parsed.submissionType,
      cleaner_id: cleanerId,
      subject: parsed.subject,
      message: parsed.message,
      status: "open",
    })
    .select("id, submission_type, status, created_at")
    .maybeSingle();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const insertedRow = inserted as { id?: string } | null;
  if (parsed.submissionType === "report" && insertedRow?.id) {
    void notifyOpsOfAnonymousCleanerReport({
      admin,
      reportId: insertedRow.id,
      subject: parsed.subject,
      message: parsed.message,
    });
  }

  return NextResponse.json({
    ok: true,
    submission: inserted,
    anonymous: parsed.submissionType === "report",
  });
}
