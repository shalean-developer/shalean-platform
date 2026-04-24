import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { emitSlaBreachManualEscalation } from "@/lib/admin/slaBreachEscalate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

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
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let slaBreachMinutes = 0;
  let lastActionMinutesAgo: number | null = null;
  try {
    const body = (await request.json()) as { slaBreachMinutes?: number; lastActionMinutesAgo?: number | null };
    if (typeof body.slaBreachMinutes === "number" && Number.isFinite(body.slaBreachMinutes)) {
      slaBreachMinutes = body.slaBreachMinutes;
    }
    if (typeof body.lastActionMinutesAgo === "number" && Number.isFinite(body.lastActionMinutesAgo)) {
      lastActionMinutesAgo = body.lastActionMinutesAgo;
    } else if (body.lastActionMinutesAgo === null) {
      lastActionMinutesAgo = null;
    }
  } catch {
    /* optional body */
  }

  await emitSlaBreachManualEscalation({
    bookingId,
    slaBreachMinutes,
    lastActionMinutesAgo,
  });

  return NextResponse.json({ ok: true });
}
