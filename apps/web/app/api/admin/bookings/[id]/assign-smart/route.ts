import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { EXTREME_SLA_AUTO_ESCALATE_MINUTES, runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

  let body: {
    force?: boolean;
    slaBreachMinutes?: number | null;
    cleanerIds?: string[];
    maxAttempts?: number;
    autoEscalateExtremeSla?: { confirm: true; slaBreachMinutes: number };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const rawIds = Array.isArray(body.cleanerIds) ? body.cleanerIds : [];
  const cleanerIds = rawIds.map((s) => String(s).trim()).filter(Boolean).slice(0, 150);

  const esc = body.autoEscalateExtremeSla;
  const autoEscalate =
    esc &&
    esc.confirm === true &&
    typeof esc.slaBreachMinutes === "number" &&
    esc.slaBreachMinutes > EXTREME_SLA_AUTO_ESCALATE_MINUTES
      ? ({ confirm: true as const, slaBreachMinutes: esc.slaBreachMinutes } as const)
      : null;

  const result = await runAdminAssignSmart(admin, {
    bookingId,
    force: body.force === true,
    slaBreachMinutes:
      typeof body.slaBreachMinutes === "number" && Number.isFinite(body.slaBreachMinutes)
        ? body.slaBreachMinutes
        : null,
    maxAttempts: typeof body.maxAttempts === "number" && body.maxAttempts > 0 ? Math.min(body.maxAttempts, 80) : 40,
    cleanerIds: cleanerIds.length > 0 ? cleanerIds : null,
    autoEscalateExtremeSla: autoEscalate,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      cleanerId: result.cleanerId,
      offerId: result.offerId,
      expiresAt: result.expiresAt,
      attempts: result.attempts,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      attempts: result.attempts,
      escalated: Boolean(result.escalated),
    },
    { status: 422 },
  );
}
