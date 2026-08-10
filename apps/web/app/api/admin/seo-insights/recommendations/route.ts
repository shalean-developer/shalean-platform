import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("seo_insights_recommendations")
    .select("id,slug,kind,severity,title,detail,confidence,workflow_status,owner_email,started_at,applied_at,verified_at,dismissed_at,verification_note,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const counts = {
    open: rows.filter((row) => row.workflow_status === "open").length,
    in_progress: rows.filter((row) => row.workflow_status === "in_progress").length,
    applied: rows.filter((row) => row.workflow_status === "applied").length,
    verified: rows.filter((row) => row.workflow_status === "verified").length,
    dismissed: rows.filter((row) => row.workflow_status === "dismissed").length,
    unassigned: rows.filter((row) => !row.owner_email).length,
  };

  return NextResponse.json({ rows, counts });
}
