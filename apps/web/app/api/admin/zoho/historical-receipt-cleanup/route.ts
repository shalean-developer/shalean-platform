import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  HISTORICAL_RECEIPT_CLEANUP_CONFIRMATION,
  reclassifyUndepositedWebsitePayments,
} from "@/lib/zoho/reclassifyUndepositedWebsitePayments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as {
    apply?: boolean;
    confirmation?: string;
  };

  try {
    const result = await reclassifyUndepositedWebsitePayments(admin, {
      apply: body.apply === true,
      confirmation: body.confirmation ?? null,
      actorUserId: auth.userId,
    });
    return NextResponse.json({
      ok: true,
      confirmation_required_for_apply: HISTORICAL_RECEIPT_CLEANUP_CONFIRMATION,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.startsWith("confirmation_required:") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
