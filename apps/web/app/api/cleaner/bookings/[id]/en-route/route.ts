import { NextResponse } from "next/server";
import { markCleanerOnTheWay } from "@/lib/booking/bookingOperations";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** REST alias for `POST /api/cleaner/jobs/:id` with `{ "action": "en_route" }`. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const op = await markCleanerOnTheWay({
    admin,
    cleanerId: session.cleanerId,
    bookingId: id.trim(),
  });
  if (op.ok) {
    return NextResponse.json(op.data ?? { ok: true }, { status: 200 });
  }
  const status = typeof op.httpStatus === "number" ? op.httpStatus : 400;
  const payload =
    op.cause && typeof op.cause === "object" && !Array.isArray(op.cause)
      ? (op.cause as Record<string, unknown>)
      : { error: op.message, code: op.code };
  return NextResponse.json(payload, { status });
}
