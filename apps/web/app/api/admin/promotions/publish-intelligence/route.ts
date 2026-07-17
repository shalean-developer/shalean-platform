import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  getPublishIntelligenceSnapshot,
  type IntelligenceWindowHours,
} from "@/lib/promotions/publishIntelligence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseWindow(raw: string | null): IntelligenceWindowHours {
  if (raw === "24" || raw === "168") return Number(raw) as IntelligenceWindowHours;
  return 72;
}

/**
 * MKT-001E — Platform Intelligence snapshot (admin-only decision engine).
 * GET /api/admin/promotions/publish-intelligence?windowHours=24|72|168&provider=&campaign=
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const windowHours = parseWindow(url.searchParams.get("windowHours"));
  const provider = url.searchParams.get("provider");
  const campaign = url.searchParams.get("campaign");

  try {
    const snapshot = await getPublishIntelligenceSnapshot(admin, {
      windowHours,
      provider,
      campaign,
    });
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
