import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import {
  backfillPaystackPaymentTransactions,
  countMissingPaystackPaymentTransactions,
} from "@/lib/payments/backfillPaystackPaymentTransactions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const missing = await countMissingPaystackPaymentTransactions(admin);
  return NextResponse.json({ missing_count: missing });
}

export async function POST(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const verify = url.searchParams.get("verify") !== "0";

  const result = await backfillPaystackPaymentTransactions(admin, {
    limit: Number.isFinite(limit) ? Math.min(500, limit) : 100,
    verifyWithPaystack: verify,
  });

  const missing = await countMissingPaystackPaymentTransactions(admin);
  return NextResponse.json({ ...result, missing_count: missing });
}
