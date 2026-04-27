import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { getRecurringRowForCustomer } from "@/lib/recurring/customerRecurringAccess";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const row = await getRecurringRowForCustomer(admin, id.trim(), auth.session.userId);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { error } = await admin
    .from("recurring_bookings")
    .update({ status: "cancelled" })
    .eq("id", id.trim())
    .eq("customer_id", auth.session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSystemEvent({
    level: "info",
    source: "me/recurring/cancel",
    message: "customer_recurring_cancelled",
    context: { recurring_id: id.trim(), user_id: auth.session.userId },
  });

  return NextResponse.json({ ok: true, id: id.trim(), status: "cancelled" });
}
