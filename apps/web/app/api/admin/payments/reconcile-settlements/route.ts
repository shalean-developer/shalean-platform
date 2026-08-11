import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { reconcilePaystackSettlements } from "@/lib/payments/reconcilePaystackSettlements";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { from?: string; to?: string } = {};
  try {
    body = (await request.json()) as { from?: string; to?: string };
  } catch {
    // Empty body is valid; the service uses a safe recent default range.
  }

  try {
    const result = await reconcilePaystackSettlements(admin, {
      from: typeof body.from === "string" ? body.from : undefined,
      to: typeof body.to === "string" ? body.to : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Paystack settlement reconciliation failed.";
    console.error("[admin/payments/reconcile-settlements]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
