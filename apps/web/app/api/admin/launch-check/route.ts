import { NextResponse } from "next/server";
import { buildOfficeLaunchCheckStatus } from "@/lib/admin/officeLaunchCheck";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { isLaunchCheckEnabled } from "@/lib/launch/launchCheckConfig";
import { runLaunchReadinessChecks } from "@/lib/launch/launchReadinessChecks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLaunchCheckEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  const status = await buildOfficeLaunchCheckStatus(admin, {
    requestingAdminUserId: auth.user.id,
    requestingAdminEmail: auth.email,
  });

  return NextResponse.json(status);
}

export async function POST(request: Request) {
  if (!isLaunchCheckEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const payload = await runLaunchReadinessChecks({
      adminUserId: auth.user.id,
      adminEmail: auth.email,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Launch check failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
