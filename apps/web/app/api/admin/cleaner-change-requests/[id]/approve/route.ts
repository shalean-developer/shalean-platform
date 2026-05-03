import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { regenerateCleanerAvailabilityFromStoredWeekdays } from "@/lib/cleaner/regenerateCleanerAvailabilityFromStoredWeekdays";
import { syncCleanerSummary } from "@/lib/cleaner/syncCleanerSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing request id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const reviewer = user.email.trim();

  const { data: reqMeta, error: metaErr } = await admin
    .from("cleaner_change_requests")
    .select("cleaner_id")
    .eq("id", id)
    .maybeSingle();
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
  const cleanerId = reqMeta?.cleaner_id != null ? String(reqMeta.cleaner_id) : "";

  const { error } = await admin.rpc("approve_cleaner_change_request", {
    p_request_id: id,
    p_reviewer: reviewer,
  });

  if (error) {
    const msg = error.message ?? "Approve failed.";
    if (msg.includes("change_request_not_found")) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }
    if (msg.includes("change_request_not_pending")) {
      return NextResponse.json({ error: "Request is no longer pending." }, { status: 409 });
    }
    if (msg.includes("change_request_invalid_days")) {
      return NextResponse.json({ error: "Request has invalid weekdays." }, { status: 400 });
    }
    if (msg.includes("change_request_invalid_locations")) {
      return NextResponse.json({ error: "Request has no preferred areas." }, { status: 400 });
    }
    if (msg.includes("change_request_unknown_location")) {
      return NextResponse.json(
        { error: "One or more area names do not match a service area in the database. Update locations or reject the request." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (cleanerId) {
    try {
      await regenerateCleanerAvailabilityFromStoredWeekdays(admin, cleanerId, { horizonDays: 60 });
      await syncCleanerSummary(admin, cleanerId);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Approved but calendar/summary sync failed." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
