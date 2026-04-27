import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { runCleanerBookingLifecycleAction } from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** REST alias for `POST /api/cleaner/jobs/:id` with `{ "action": "start" }`. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const out = await runCleanerBookingLifecycleAction({
    admin,
    cleanerId: session.cleanerId,
    bookingId: id.trim(),
    action: "start",
  });
  return NextResponse.json(out.json, { status: out.status });
}
