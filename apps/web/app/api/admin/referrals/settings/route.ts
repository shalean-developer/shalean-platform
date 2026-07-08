import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getReferralProgramSettings,
  updateReferralProgramSettings,
  invalidateReferralSettingsCache,
  type ReferralProgramSettings,
} from "@/lib/referrals/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const settings = await getReferralProgramSettings(admin);
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Partial<ReferralProgramSettings>;
  try {
    body = (await request.json()) as Partial<ReferralProgramSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await updateReferralProgramSettings(admin, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  invalidateReferralSettingsCache();
  return NextResponse.json({ settings: result.settings });
}
