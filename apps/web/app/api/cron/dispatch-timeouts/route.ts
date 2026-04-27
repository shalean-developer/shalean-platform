import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { runDispatchTimeouts } from "@/lib/dispatch/runDispatchTimeouts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: `Authorization: Bearer CRON_SECRET` (Vercel) or `x-cron-secret: CRON_SECRET` (Supabase pg_net).
 * Expires pending dispatch offers past `expires_at` and runs reassignment when safe.
 */
export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const stats = await runDispatchTimeouts(admin);
  return NextResponse.json({ ok: true, ...stats });
}

export async function POST(request: Request) {
  return GET(request);
}
