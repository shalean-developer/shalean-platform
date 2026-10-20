import { isReviewDetailChoices } from "@/lib/reviews/publicReviewDetails";
import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermissionFromRequest(request, "content.publish");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid review id." }, { status: 400 });
  }
  let body: { approved?: unknown; permissionConfirmed?: unknown; expectedComment?: unknown; expectedConsent?: unknown; expectedPreferences?: unknown; expectedContext?: unknown; details?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body?.approved !== "boolean") {
    return NextResponse.json({ error: "approved boolean required." }, { status: 400 });
  }
  if (body.approved && typeof body.expectedConsent !== "boolean") {
    return NextResponse.json({ error: "Current display preference required. Refresh the review before approving." }, { status: 400 });
  }
  if (body.approved && (!isReviewDetailChoices(body.expectedPreferences) || !isReviewDetailChoices(body.details) || !body.expectedContext || typeof body.expectedContext !== "object")) {
    return NextResponse.json({ error: "Current detail preferences, preview and explicit choices required." }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { error } = await admin.rpc("set_review_homepage_publication_v2", {
    p_expected_preferences: body.expectedPreferences ?? null,
    p_expected_context: body.expectedContext ?? null,
    p_details: body.details ?? null,
    p_review_id: id,
    p_publish: body.approved,
    p_expected_consent: typeof body.expectedConsent === "boolean" ? body.expectedConsent : null,
    p_actor_id: auth.user.id,
    p_expected_comment: typeof body.expectedComment === "string" ? body.expectedComment : null,
    p_permission_confirmed: body.permissionConfirmed === true,
  });
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message : "Could not update homepage publication." }, { status: error.code === "P0001" ? 400 : 500 });
  return NextResponse.json({ ok: true });
}
