import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; reportId: string }> },
) {
  const { id: bookingId, reportId } = await ctx.params;
  if (!bookingId || !reportId) {
    return NextResponse.json({ error: "Missing booking or report id." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: { resolved?: unknown };
  try {
    body = (await request.json()) as { resolved?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (body.resolved !== true) {
    return NextResponse.json({ error: "Expected { \"resolved\": true }." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: rep, error: selErr } = await admin
    .from("cleaner_job_issue_reports")
    .select("id, booking_id, resolved_at")
    .eq("id", reportId)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!rep || String((rep as { booking_id?: string }).booking_id) !== bookingId) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  if ((rep as { resolved_at?: string | null }).resolved_at) {
    return NextResponse.json({ ok: true as const, alreadyResolved: true as const });
  }

  const { error: upErr } = await admin
    .from("cleaner_job_issue_reports")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: user.email.trim().slice(0, 320),
    })
    .eq("id", reportId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true as const });
}
