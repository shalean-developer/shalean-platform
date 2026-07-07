import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmissionRow = {
  id: string;
  submission_type: string;
  subject: string | null;
  message: string;
  status: string;
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
  cleaner_id?: string;
};

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const typeFilter = url.searchParams.get("type")?.trim().toLowerCase() ?? "";
  const statusFilter = url.searchParams.get("status")?.trim().toLowerCase() ?? "";
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit")) || 200));

  const statusKeys = ["open", "reviewing", "resolved", "closed"] as const;
  const countQueries = statusKeys.map((status) =>
    admin.from("cleaner_report_feedback").select("id", { count: "exact", head: true }).eq("status", status),
  );

  let q = admin
    .from("cleaner_report_feedback")
    .select(
      "id, submission_type, cleaner_id, subject, message, status, admin_response, created_at, resolved_at, reviewed_by_email, resolved_by_email",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (typeFilter === "report" || typeFilter === "feedback") {
    q = q.eq("submission_type", typeFilter);
  }
  if (statusKeys.includes(statusFilter as (typeof statusKeys)[number])) {
    q = q.eq("status", statusFilter);
  }

  const [{ data: rows, error }, ...countResults] = await Promise.all([q, ...countQueries]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (rows ?? []) as SubmissionRow[];
  const feedbackCleanerIds = [
    ...new Set(
      list
        .filter((r) => r.submission_type === "feedback")
        .map((r) => String(r.cleaner_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  const { data: cleaners } = feedbackCleanerIds.length
    ? await admin.from("cleaners").select("id, full_name, phone").in("id", feedbackCleanerIds)
    : { data: [] };

  const cleanerBy = new Map<string, { name: string; phone: string | null }>();
  for (const c of cleaners ?? []) {
    const row = c as { id?: string; full_name?: string | null; phone?: string | null };
    if (row.id) {
      cleanerBy.set(String(row.id), {
        name: String(row.full_name ?? "").trim() || String(row.id),
        phone: row.phone ?? null,
      });
    }
  }

  const statusCounts = Object.fromEntries(
    statusKeys.map((status, i) => [status, countResults[i]?.count ?? 0]),
  ) as Record<(typeof statusKeys)[number], number>;

  const typeCounts = {
    report: list.filter((r) => r.submission_type === "report").length,
    feedback: list.filter((r) => r.submission_type === "feedback").length,
  };

  const enriched = list.map((raw) => {
    const isReport = raw.submission_type === "report";
    const cleaner = !isReport && raw.cleaner_id ? cleanerBy.get(raw.cleaner_id) : null;
    return {
      id: raw.id,
      submission_type: raw.submission_type,
      subject: raw.subject,
      message: raw.message,
      status: raw.status,
      admin_response: raw.admin_response,
      created_at: raw.created_at,
      resolved_at: raw.resolved_at,
      reporter_label: isReport ? "Anonymous" : (cleaner?.name ?? "Unknown cleaner"),
      reporter_phone: isReport ? null : (cleaner?.phone ?? null),
      cleaner_id: isReport ? null : (raw.cleaner_id ?? null),
    };
  });

  return NextResponse.json({
    submissions: enriched,
    statusCounts,
    typeCounts,
    meta: { limit, returned: enriched.length },
  });
}
