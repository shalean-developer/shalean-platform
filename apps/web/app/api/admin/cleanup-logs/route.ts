import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sentinel: delete all rows (PostgREST requires a filter). */
const ALL_ROWS = "00000000-0000-0000-0000-000000000000";

const TARGETS = [
  "system_logs",
  "dispatch_logs",
  "dispatch_retry_queue",
  "failed_jobs_booking_insert",
  /** Funnel counts on Admin → Bookings / Analytics (rolling window in API). */
  "booking_events",
] as const;

type CleanupTarget = (typeof TARGETS)[number];

function isCleanupTarget(v: unknown): v is CleanupTarget {
  return typeof v === "string" && (TARGETS as readonly string[]).includes(v);
}

/**
 * Admin-only: clear diagnostic queues / logs. Does not touch bookings, cleaners, or pricing.
 * POST JSON body: `{ "targets": ["system_logs", ...] }` — each target must be listed explicitly.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawTargets =
    body && typeof body === "object" && "targets" in body && Array.isArray((body as { targets: unknown }).targets)
      ? (body as { targets: unknown[] }).targets
      : null;
  if (!rawTargets?.length) {
    return NextResponse.json(
      {
        error: "Provide a non-empty `targets` array.",
        allowed: [...TARGETS],
      },
      { status: 400 },
    );
  }

  const targets = rawTargets.filter(isCleanupTarget);
  if (targets.length !== rawTargets.length) {
    return NextResponse.json({ error: "Unknown target in `targets`.", allowed: [...TARGETS] }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const deleted: Record<string, number> = {};
  const errors: Record<string, string> = {};

  for (const t of targets) {
    if (t === "failed_jobs_booking_insert") {
      const { data, error } = await admin
        .from("failed_jobs")
        .delete()
        .eq("type", "booking_insert")
        .select("id");
      if (error) errors[t] = error.message;
      else deleted[t] = data?.length ?? 0;
      continue;
    }

    const table = t;
    const { data, error } = await admin.from(table).delete().neq("id", ALL_ROWS).select("id");
    if (error) errors[t] = error.message;
    else deleted[t] = data?.length ?? 0;
  }

  const ok = Object.keys(errors).length === 0;
  return NextResponse.json({ ok, deleted, errors: Object.keys(errors).length ? errors : undefined });
}
