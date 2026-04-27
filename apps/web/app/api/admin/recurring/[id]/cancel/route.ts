import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("recurring_bookings").update({ status: "cancelled" }).eq("id", id.trim());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSystemEvent({
    level: "info",
    source: "admin/recurring/cancel",
    message: "recurring_cancelled",
    context: { recurring_id: id.trim(), admin_id: auth.user.id },
  });

  return NextResponse.json({ ok: true, id: id.trim(), status: "cancelled" });
}
