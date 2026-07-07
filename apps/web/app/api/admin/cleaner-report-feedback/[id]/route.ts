import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  status?: string;
  admin_response?: string | null;
};

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? "").trim())) {
    return NextResponse.json({ error: "Invalid submission id." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const nextStatus = String(body.status ?? "").toLowerCase().trim();
  if (!["reviewing", "resolved", "closed"].includes(nextStatus)) {
    return NextResponse.json({ error: "status must be reviewing, resolved, or closed." }, { status: 400 });
  }

  const note = typeof body.admin_response === "string" ? body.admin_response.trim() : "";
  if ((nextStatus === "resolved" || nextStatus === "closed") && note.length < 1) {
    return NextResponse.json({ error: "admin_response is required when resolving or closing." }, { status: 400 });
  }
  if (note.length > 8000) {
    return NextResponse.json({ error: "admin_response too long." }, { status: 400 });
  }

  const { data: existing, error: exErr } = await admin
    .from("cleaner_report_feedback")
    .select("id, status, reviewed_by, reviewed_by_email, reviewed_at")
    .eq("id", id)
    .maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  const row = existing as
    | {
        id?: string;
        status?: string;
        reviewed_by?: string | null;
        reviewed_by_email?: string | null;
        reviewed_at?: string | null;
      }
    | null;
  if (!row?.id) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  const cur = String(row.status ?? "").toLowerCase();
  if (cur === "resolved" || cur === "closed") {
    return NextResponse.json({ error: "Submission is already closed." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const adminUserId = auth.userId.trim();
  const adminEmail = auth.email.trim();
  const isUuid = /^[0-9a-f-]{36}$/i.test(adminUserId);
  const reviewerStamp =
    isUuid && !row.reviewed_by
      ? { reviewed_by: adminUserId, reviewed_by_email: adminEmail || null, reviewed_at: now }
      : null;
  const isClosing = nextStatus === "resolved" || nextStatus === "closed";

  const patch: Record<string, unknown> = {
    status: nextStatus,
    resolved_at: isClosing ? now : null,
  };
  if (isClosing) {
    patch.admin_response = note;
    patch.resolved_by = isUuid ? adminUserId : null;
    patch.resolved_by_email = adminEmail || null;
  } else if (note.length > 0) {
    patch.admin_response = note;
  }
  if (reviewerStamp) Object.assign(patch, reviewerStamp);

  const { data: updated, error: upErr } = await admin
    .from("cleaner_report_feedback")
    .update(patch)
    .eq("id", id)
    .select("id, submission_type, status, admin_response, resolved_at")
    .maybeSingle();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, submission: updated });
}
