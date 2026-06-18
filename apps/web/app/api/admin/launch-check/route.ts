import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { isLaunchCheckEnabled } from "@/lib/launch/launchCheckConfig";
import { runLaunchReadinessChecks } from "@/lib/launch/launchReadinessChecks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLaunchCheckEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const payload = await runLaunchReadinessChecks({ adminUserId: auth.userId });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Launch check failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
