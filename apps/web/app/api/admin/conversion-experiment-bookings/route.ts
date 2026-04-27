import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "payment_email_timing",
  "payment_reminder_timing",
  "email_copy_test",
]);

/**
 * Drill-down: recent bookings exposed to a conversion experiment (subject_id = booking id).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const { data: userData } = await pub.auth.getUser(token);
  if (!userData.user?.email || !isAdmin(userData.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const experimentKey = searchParams.get("experiment_key")?.trim() ?? "";
  if (!experimentKey || !ALLOWED_KEYS.has(experimentKey)) {
    return NextResponse.json({ error: "Invalid or missing experiment_key." }, { status: 400 });
  }

  const variant = searchParams.get("variant")?.trim() || undefined;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "40") || 40));

  let q = admin
    .from("ai_experiment_exposures")
    .select("subject_id, variant, created_at")
    .eq("experiment_key", experimentKey)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (variant) {
    q = q.eq("variant", variant);
  }

  const { data: exps, error: e1 } = await q;
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }

  const subjects = [...new Set((exps ?? []).map((r) => String((r as { subject_id?: string }).subject_id ?? "").trim()).filter(Boolean))];
  if (!subjects.length) {
    return NextResponse.json({ experiment_key: experimentKey, rows: [] });
  }

  const { data: bookings, error: e2 } = await admin
    .from("bookings")
    .select("id, status, customer_email, payment_completed_at, city_id, payment_link_first_sent_at")
    .in("id", subjects);

  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  const byId = new Map((bookings ?? []).map((b) => [String((b as { id: string }).id), b as Record<string, unknown>]));

  const rows = (exps ?? []).map((raw) => {
    const e = raw as { subject_id: string; variant: string; created_at: string };
    const b = byId.get(String(e.subject_id));
    return {
      booking_id: e.subject_id,
      variant: e.variant,
      exposure_at: e.created_at,
      status: b ? String(b.status ?? "") : "unknown",
      customer_email: b ? (b.customer_email as string | null) ?? null : null,
      payment_completed_at: b ? (b.payment_completed_at as string | null) ?? null : null,
      city_id: b ? (b.city_id as string | null) ?? null : null,
      payment_link_first_sent_at: b ? (b.payment_link_first_sent_at as string | null) ?? null : null,
    };
  });

  return NextResponse.json({ experiment_key: experimentKey, rows });
}
